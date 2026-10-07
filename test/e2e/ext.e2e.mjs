// 端到端：加载 dist/ 扩展，在模拟的 x.com 页面上识别视频、收藏，并检查收藏集页面与导出。
// 用法：npm run build && npm run e2e   （需联网访问 trace.moe / Bangumi）
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ext = path.resolve('dist');
const clip = readFileSync('test/e2e/clip.mp4');
const poster = readFileSync('test/e2e/poster.jpg');
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
    await p.evaluate(() => document.querySelector('video').play());
    await p.waitForTimeout(500);

    await p.locator('.xal-btn').click(); // playwright 可穿透 open shadow root
    const t0 = Date.now();
    const card = p.locator('.xal-card');
    await card.waitFor();
    // 点击识别不应暂停视频
    if (await p.evaluate(() => document.querySelector('video').paused)) {
      throw new Error(`[${cors ? 'cors-video' : 'direct-src'}] video paused after recognize click`);
    }
    await p.waitForFunction(
      () => {
        const c = document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-card');
        return c && c.getAttribute('data-state') !== 'loading';
      },
      null,
      { timeout: 60000 },
    );
    const first = Date.now() - t0;
    const pendingAtFirst = await p.locator('.xal-pending').allTextContents();
    await p.waitForFunction(
      () => !document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-pending'),
      null,
      { timeout: 60000 },
    );
    console.log(`[${cors ? 'cors-video' : 'direct-src'}] first result ${first}ms (pending: ${pendingAtFirst.join(', ') || '-'}), all done ${Date.now() - t0}ms`);
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
    const srcs = await p.locator('.xal-item').first().locator('.xal-src').allTextContents();
    const chip = p.locator('.xal-char[href]').first();
    await chip.waitFor({ timeout: 20000 });
    await chip.locator('img').waitFor({ timeout: 20000 }).catch(() => {});
    await p.locator('.xal-chars').first().screenshot({ path: `${out}/chars-${cors ? 'cors-video' : 'direct-src'}.png` });
    const chars = `${await chip.textContent()} → ${await chip.getAttribute('href')} avatar=${(await chip.locator('img').count()) > 0}`;
    console.log(`[${tag}] sources: ${srcs.join(' | ')}  ${chars}`);
    if (!srcs.includes('AnimeTrace')) throw new Error(`[${tag}] AnimeTrace 未合并到首条结果`);

    if (cors) {
      // 复现：扩展更新/重载后不刷新 X 页面，再点识别
      const old = sw;
      // 与在 chrome://extensions 点“刷新”相同；需开启开发者模式（用户环境本就开启）
      const mgr = await ctx.newPage();
      await mgr.goto('chrome://extensions');
      await mgr.evaluate(() => new Promise((r) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, r)));
      await mgr.evaluate((eid) => new Promise((r) => chrome.developerPrivate.reload(eid, { failQuietly: true }, r)), id);
      await mgr.close();
      await p.bringToFront();
      for (let i = 0; i < 60 && (sw === old || !sw); i++) {
        await p.waitForTimeout(250);
        sw = ctx.serviceWorkers().find((w) => w !== old) ?? old;
      }
      console.log(`[${tag}] new service worker: ${sw !== old}`);
      await p.waitForFunction(
        () => document.querySelectorAll('.xal-btn-host').length === 1 && !document.querySelector('#xal-host'),
        null,
        { timeout: 15000 },
      ).catch(() => {});
      const hosts = await p.locator('.xal-btn-host').count();
      await p.locator('.xal-btn').click();
      await p.waitForFunction(
        () => {
          const c = document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-card');
          return c && c.getAttribute('data-state') !== 'loading';
        },
        null,
        { timeout: 60000 },
      );
      const st = await p.locator('.xal-card').getAttribute('data-state');
      const msg = st === 'ok' ? '' : await p.locator('.xal-err-msg').textContent();
      console.log(`[${tag}] after extension reload: buttons=${hosts} state=${st} ${msg}`);
      if (st !== 'ok') throw new Error(`[${tag}] 扩展重载后识别失败：${msg}`);
    }

    await p.locator('.xal-cmp-btn').first().click();
    await p.waitForFunction(
      () => {
        const v = document.querySelector('#xal-host').shadowRoot.querySelector('.xal-cmp video');
        return v && v.readyState >= 2 && v.currentTime > 0;
      },
      null,
      { timeout: 30000 },
    );
    const inSrc = await p.locator('.xal-cmp img.xal-cmp-media').first().getAttribute('src');
    await p.screenshot({ path: `${out}/compare-${tag}.png` });
    console.log(`[${tag}] compare: input=${inSrc ? inSrc.slice(0, 22) : 'none'}, clip playing`);

    await p.locator('.xal-fav').first().click();
    await p.waitForFunction(() =>
      document.querySelector('#xal-host').shadowRoot.querySelector('.xal-fav.xal-on'),
    );

    // 0.2.0 之前格式的旧收藏：无 kind/genres/srcs/chars，打开收藏集后应自动补全标签
    await sw.evaluate(async () => {
      const r = await chrome.storage.local.get('favs');
      const favs = r.favs ?? {};
      favs['legacy'] = { key: 'legacy', anilistId: 1, bgmId: 1424, title: '旧收藏', native: '', cover: '',
        episode: '3', at: 60, similarity: 0.95, tweetUrl: '', savedAt: '2020-01-01T00:00:00.000Z', note: '' };
      await chrome.storage.local.set({ favs });
    });
    const col = await ctx.newPage();
    await col.goto(`chrome-extension://${id}/collection.html`);
    await col.locator('.col-card').first().waitFor();
    const legacy = col.locator('.col-card', { hasText: '旧收藏' });
    await legacy.locator('.col-kind').waitFor({ timeout: 20000 });
    console.log(`[${tag}] legacy backfill: ${(await legacy.locator('.col-tags').textContent()).trim()} | src=${await legacy.locator('.col-src').textContent()}`);
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

// 视频尚未加载（readyState=0）：lazy = preload=none 的直链；poster = 只有封面、无可加载的源（同 X 未拉流的 MSE 播放器）
class Cold {
  static html(mode) {
    const media = mode === 'lazy'
      ? 'src="https://video.twimg.com/e2e.mp4" preload="none"'
      : 'poster="https://pbs.twimg.com/e2e.jpg" preload="none"';
    return `<!doctype html><html><body style="background:#000;margin:0">
<article data-testid="tweet" style="width:640px;margin:40px">
  <a href="/someone/status/123456789"><time>1h</time></a>
  <div data-testid="videoPlayer" style="width:640px;height:360px">
    <video ${media} muted playsinline style="width:100%;height:100%"></video>
  </div>
</article></body></html>`;
  }

  static async run(mode) {
    const ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    await ctx.route('https://x.com/**', (r) => r.fulfill({ contentType: 'text/html', body: Cold.html(mode) }));
    await ctx.route('https://video.twimg.com/**', (r) =>
      r.fulfill({ contentType: 'video/mp4', body: clip, headers: { 'access-control-allow-origin': 'https://x.com' } }),
    );
    await ctx.route('https://pbs.twimg.com/**', (r) =>
      r.fulfill({ contentType: 'image/jpeg', body: poster, headers: { 'access-control-allow-origin': '*' } }),
    );
    if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker');
    const p = await ctx.newPage();
    await p.goto('https://x.com/home');
    await p.locator('.xal-btn').waitFor();
    const rs = await p.evaluate(() => document.querySelector('video').readyState);
    if (rs >= 2) throw new Error(`[cold-${mode}] 前置条件失败：视频已加载 readyState=${rs}`);
    await p.locator('.xal-btn').click();
    await p.waitForFunction(
      () => {
        const c = document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-card');
        return c && c.getAttribute('data-state') !== 'loading';
      },
      null,
      { timeout: 60000 },
    );
    const state = await p.locator('.xal-card').getAttribute('data-state');
    await p.screenshot({ path: `${out}/card-cold-${mode}.png` });
    if (state !== 'ok') {
      throw new Error(`[cold-${mode}] card state=${state} msg=${await p.locator('.xal-err-msg').textContent()}`);
    }
    console.log(`[cold-${mode}] readyState=${rs} ok: ${await p.locator('.xal-title').first().textContent()}`);
    await ctx.close();
  }
}

// 推文图片：缩略图换大图识别；套在图片容器里的视频只出现播放器自己的按钮
class Photo {
  static html() {
    return `<!doctype html><html><body style="background:#000;margin:0">
<article data-testid="tweet" style="width:640px;margin:40px">
  <a href="/someone/status/123456789"><time>1h</time></a>
  <a href="/someone/status/123456789/photo/1">
    <div data-testid="tweetPhoto" style="width:640px;height:360px">
      <img src="https://pbs.twimg.com/media/e2e?format=jpg&name=small" style="width:100%;height:100%">
    </div>
  </a>
  <div data-testid="tweetPhoto" id="small" style="width:80px;height:80px">
    <img src="https://pbs.twimg.com/media/e2e-small?format=jpg&name=small" style="width:100%;height:100%">
  </div>
  <div data-testid="tweetPhoto" id="gif" style="width:640px;height:360px">
    <div data-testid="videoPlayer" style="width:100%;height:100%"><video muted></video></div>
  </div>
</article></body></html>`;
  }

  /** shot：大图不可用、缩略图无 CORS 头，只能走整页截图兜底 */
  static async run(mode = 'cors') {
    const ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 1000 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    const asked = [];
    await ctx.route('https://x.com/**', (r) => r.fulfill({ contentType: 'text/html', body: Photo.html() }));
    await ctx.route('https://pbs.twimg.com/**', (r) => {
      const u = r.request().url();
      asked.push(u);
      if (mode === 'shot') {
        if (u.includes('name=large')) return r.fulfill({ status: 404, body: '' });
        return r.fulfill({ contentType: 'image/jpeg', body: poster });
      }
      return r.fulfill({ contentType: 'image/jpeg', body: poster, headers: { 'access-control-allow-origin': '*' } });
    });
    if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker');
    const p = await ctx.newPage();
    await p.goto('https://x.com/home');
    const btn = p.locator('[data-testid="tweetPhoto"]:not(#gif) .xal-btn');
    await btn.waitFor();
    if (await p.locator('#gif > .xal-btn-host').count()) throw new Error('[photo] 视频容器外层重复注入按钮');
    // 过小的图片不显示按钮；放大后出现，再缩小后移除
    if (await p.locator('#small > .xal-btn-host').count()) throw new Error('[photo] 小图显示了识别按钮');
    await p.evaluate(() => Object.assign(document.querySelector('#small').style, { width: '300px', height: '200px' }));
    await p.locator('#small > .xal-btn-host').waitFor({ timeout: 5000 });
    await p.evaluate(() => Object.assign(document.querySelector('#small').style, { width: '80px', height: '80px' }));
    await p.locator('#small > .xal-btn-host').waitFor({ state: 'detached', timeout: 5000 });
    await btn.click();
    await p.waitForFunction(
      () => {
        const c = document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-card');
        return c && c.getAttribute('data-state') !== 'loading';
      },
      null,
      { timeout: 60000 },
    );
    const state = await p.locator('.xal-card').getAttribute('data-state');
    await p.screenshot({ path: `${out}/card-photo-${mode}.png` });
    if (state !== 'ok') throw new Error(`[photo-${mode}] card state=${state} msg=${await p.locator('.xal-err-msg').textContent()}`);
    if (!asked.some((u) => u.includes('name=large'))) throw new Error(`[photo] 未请求大图: ${asked.join(', ')}`);
    if (p.url() !== 'https://x.com/home') throw new Error(`[photo] 点击按钮触发了跳转: ${p.url()}`);
    const quota = await p.locator('.xal-quota').textContent();
    console.log(`[photo-${mode}] ok: ${await p.locator('.xal-title').first().textContent()} | ${quota}`);
    await ctx.close();
  }
}

// 可选参数只跑部分场景（节省 trace.moe 额度）：node test/e2e/ext.e2e.mjs photo
const only = process.argv[2];
if (!only || only === 'video') {
  await E2e.run(true);
  await E2e.run(false);
}
if (!only || only === 'cold') {
  await Cold.run('lazy');
  await Cold.run('poster');
}
if (!only || only === 'photo') {
  await Photo.run('cors');
  await Photo.run('shot');
}
console.log('E2E PASS');
