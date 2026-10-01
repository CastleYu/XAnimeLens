// 端到端：加载 dist/ 扩展，在模拟的 x.com 页面上识别视频、收藏，并检查收藏集页面与导出。
// 用法：npm run build && npm run e2e   （需联网访问 trace.moe / Bangumi）
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ext = path.resolve('dist');
const clip = readFileSync('test/e2e/clip.mp4');
const out = 'Temp/e2e';
mkdirSync(out, { recursive: true });

const page = (cors) => `<!doctype html><html><body style="background:#000;margin:0">
<article data-testid="tweet" style="width:640px;margin:40px">
  <a href="/someone/status/123456789"><time>1h</time></a>
  <div data-testid="videoPlayer" style="width:640px;height:360px">
    <video ${cors ? 'crossorigin="anonymous"' : ''} src="https://video.twimg.com/e2e.mp4" muted playsinline
      style="width:100%;height:100%"></video>
  </div>
</article></body></html>`;

class E2e {
  static async run(cors) {
    const ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    await ctx.route('https://x.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: page(cors) }),
    );
    await ctx.route('https://video.twimg.com/**', (r) =>
      r.fulfill({
        contentType: 'video/mp4',
        body: clip,
        headers: { 'access-control-allow-origin': 'https://x.com' }, // 与 video.twimg.com 行为一致
      }),
    );
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2];

    const p = await ctx.newPage();
    const logs = [];
    p.on('console', (m) => logs.push(m.text()));
    await p.goto('https://x.com/home');
    await p.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await p.evaluate(() => (document.querySelector('video').currentTime = 3));
    await p.waitForTimeout(500);

    await p.locator('.xal-btn').click(); // playwright 可穿透 open shadow root
    const card = p.locator('.xal-card');
    await card.waitFor();
    await p.waitForFunction(
      () => {
        const c = document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-card');
        return c && c.getAttribute('data-state') !== 'loading';
      },
      null,
      { timeout: 60000 },
    );
    const state = await card.getAttribute('data-state');
    const tag = cors ? 'cors-video' : 'direct-src';
    await p.screenshot({ path: `${out}/card-${tag}.png` });
    if (state !== 'ok') {
      const msg = await p.locator('.xal-err-msg').textContent();
      throw new Error(`[${tag}] card state=${state} msg=${msg} logs=${logs.join(' | ')}`);
    }
    const title = await p.locator('.xal-title').first().textContent();
    const sim = await p.locator('.xal-sim').first().textContent();
    const imgs = await p.locator('.xal-cover').first().getAttribute('src');
    console.log(`[${tag}] ok: ${title} ${sim} cover=${imgs ? imgs.slice(0, 22) : 'none'}`);

    await p.locator('.xal-fav').first().click();
    await p.waitForFunction(() =>
      document.querySelector('#xal-host').shadowRoot.querySelector('.xal-fav.xal-on'),
    );

    const col = await ctx.newPage();
    await col.goto(`chrome-extension://${id}/collection.html`);
    await col.locator('.col-card').first().waitFor();
    const n = await col.locator('.col-card').count();
    const tweet = await col.locator('.col-tweet').first().getAttribute('href');
    await col.screenshot({ path: `${out}/collection-${tag}.png`, fullPage: true });
    const dl = col.waitForEvent('download');
    await col.locator('#col-export-json').click();
    const file = await (await dl).path();
    const json = JSON.parse(readFileSync(file, 'utf8'));
    console.log(`[${tag}] collection: ${n} item(s), tweet=${tweet}, export items=${json.items.length}`);
    await ctx.close();
  }
}

await E2e.run(true);
await E2e.run(false);
console.log('E2E PASS');
