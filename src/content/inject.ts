import css from './card.css';
import { Bus } from './msg';
import { Capture } from './capture';
import { Card } from './card';
import { CardDom, Dom, ErrText, Msg, Txt } from '../shared/consts';
import type { CardData } from '../shared/types';

/** 发现视频、注入识别按钮。 */
export class Inject {
  static boot(): void {
    Inject.scan();
    Inject.watch();
  }

  static watch(): void {
    let queued = false;
    const obs = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        Inject.scan();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  static scan(): void {
    document.querySelectorAll<HTMLElement>(Dom.VIDEO_SEL).forEach((el) => Inject.one(el));
  }

  /** 给单个播放器注入按钮；React 重建宿主时补回 */
  static one(el: HTMLElement): void {
    if (el.querySelector<HTMLElement>(`:scope > .${CardDom.BTN_HOST}`)) return;
    el.setAttribute(Dom.MARK_ATTR, '1');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const host = document.createElement('div');
    host.className = CardDom.BTN_HOST;
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
      const data = await Bus.send<CardData>({ type: Msg.RECOGNIZE, img });
      await Card.render(data, Inject.tweetUrl(el), img);
    } catch (e) {
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
