import css from './card.css';
import { Bus } from './msg';
import { Capture } from './capture';
import { Card } from './card';
import { CardDom, Dom, ErrText, Msg, Txt } from '../shared/consts';
import type { CardData } from '../shared/types';

/** 发现视频、注入识别按钮。 */
export class Inject {
  static boot(): void {
    // 最后启动的实例接管页面（manifest 注入与更新后补注入可能同时存在）
    document.documentElement.setAttribute(Dom.OWNER_ATTR, Inject.id);
    // 旧实例留下的卡片已与扩展断开，其按钮（重试 / 收藏 / 关闭）都会失效，接管时直接移除
    document.getElementById(Dom.HOST_ID)?.remove();
    Inject.scan();
    Inject.watch();
  }

  static watch(): void {
    let queued = false;
    const obs = new MutationObserver(() => {
      // 扩展更新后旧实例失效：停止观察，让新注入的实例接管按钮
      if (!Inject.live()) {
        obs.disconnect();
        return;
      }
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        Inject.scan();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /** 仍与扩展连接，且是当前接管页面的实例 */
  static live(): boolean {
    return !!chrome.runtime?.id && document.documentElement.getAttribute(Dom.OWNER_ATTR) === Inject.id;
  }

  static scan(): void {
    if (!Inject.live()) return;
    document.querySelectorAll<HTMLElement>(Dom.VIDEO_SEL).forEach((el) => Inject.one(el));
  }

  /** 给单个播放器注入按钮；React 重建宿主时补回 */
  /** 本脚本实例标识；旧实例（扩展更新前注入、已失效）留下的按钮会被替换 */
  static readonly id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  static one(el: HTMLElement): void {
    const own = `:scope > .${CardDom.BTN_HOST}[${Dom.INST_ATTR}="${Inject.id}"]`;
    if (el.querySelector<HTMLElement>(own)) return;
    el.querySelectorAll(`:scope > .${CardDom.BTN_HOST}`).forEach((n) => n.remove());
    el.setAttribute(Dom.MARK_ATTR, '1');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const host = document.createElement('div');
    host.className = CardDom.BTN_HOST;
    host.setAttribute(Dom.INST_ATTR, Inject.id);
    Object.assign(host.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '3',
    });

    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    root.append(style);

    const btn = document.createElement('button');
    btn.className = CardDom.BTN;
    btn.type = 'button';
    btn.title = Txt.BTN_TITLE;
    const label = document.createElement('span');
    label.textContent = Txt.BTN_IDLE;
    btn.append(Inject.icon(), label);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void Inject.run(el, btn);
    });

    root.append(btn);
    el.append(host);
  }

  /** 点击流程：暂停 → 截帧 → 识别 → 渲染；异常显示可重试卡片 */
  static async run(el: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    const video = el.querySelector('video');
    if (!video) {
      Card.error(ErrText.NO_VIDEO, () => void Inject.run(el, btn));
      return;
    }
    Inject.busy(btn, true);
    try {
      video.pause();
      Card.loading();
      const img = await Capture.frame(video);
      const url = Inject.tweetUrl(el);
      // 先返回的来源先展示，后续来源返回后重新合并渲染
      await Bus.stream(img, (data, done) => Card.render(data, url, img, done));
    } catch (e) {
      console.error('[XAnimeLens] recognize failed', e);
      Card.error(ErrText.of(e), () => void Inject.run(el, btn));
    } finally {
      Inject.busy(btn, false);
    }
  }

  /** 推文链接：article 内 time 的最近 a[href] */
  static tweetUrl(el: HTMLElement): string {
    const tweet = el.closest(Dom.TWEET_SEL);
    const time = tweet?.querySelector('time');
    const a = time?.closest('a') as HTMLAnchorElement | null;
    const href = a?.getAttribute('href');
    if (href) {
      try {
        return new URL(href, location.href).toString();
      } catch {
        return href;
      }
    }
    return location.href;
  }

  static busy(btn: HTMLButtonElement, on: boolean): void {
    btn.classList.toggle(CardDom.BTN_BUSY, on);
    const label = btn.querySelector('span');
    if (label) label.textContent = on ? Txt.BTN_BUSY : Txt.BTN_IDLE;
  }

  static icon(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', CardDom.ICO);
    svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', Txt.MAG);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    svg.append(p);
    return svg;
  }
}
