// 端到端：加载 dist/ 扩展，在模拟的 x.com 页面上识别视频、收藏，并检查收藏集页面与导出。
// 用法：npm run build && npm run e2e   （需联网访问 trace.moe / Bangumi；lens 场景全部模拟，可离线：npm run e2e lens）
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
    // Bangumi 不可用时角色只显示名字（无角色页链接），以头部角标为准
    const bgmDown = (await p.locator('.xal-svr[data-svr="bangumi"]').getAttribute('data-state')) === 'fail';
    const chip = p.locator(bgmDown ? '.xal-char:not(.xal-char-load)' : '.xal-char[href]').first();
    await chip.waitFor({ timeout: 20000 });
    if (bgmDown) console.log(`[${tag}] Bangumi 不可用，跳过角色页链接检查`);
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
    // 对比展开后片段播放，收起后暂停，再展开继续播放
    const clip = () => document.querySelector('#xal-host').shadowRoot.querySelector('.xal-cmp video');
    const tog = p.locator('.xal-cmp-btn').first();
    await tog.click();
    await p.waitForFunction(() => {
      const v = document.querySelector('#xal-host').shadowRoot.querySelector('.xal-cmp video');
      return v && !v.paused && v.currentTime > 0;
    }, null, { timeout: 30000 });
    await tog.click();
    await p.waitForTimeout(300);
    if (!(await p.evaluate(clip)) || !(await p.evaluate(() => document.querySelector('#xal-host').shadowRoot.querySelector('.xal-cmp video').paused))) {
      throw new Error(`[photo-${mode}] 收起对比后片段仍在播放`);
    }
    await tog.click();
    await p.waitForFunction(() => !document.querySelector('#xal-host').shadowRoot.querySelector('.xal-cmp video').paused, null, { timeout: 5000 });
    const quota = await p.locator('.xal-quota').textContent();
    console.log(`[photo-${mode}] ok: ${await p.locator('.xal-title').first().textContent()} | ${quota}`);
    await ctx.close();
  }
}

/** Bangumi 挂掉（请求一直无响应）：结果应先展示，Bangumi 角标变红，角色占位对齐 */
class Down {
  static async run() {
    const ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 1000 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    await ctx.route('https://x.com/**', (r) => r.fulfill({ contentType: 'text/html', body: Photo.html() }));
    await ctx.route('https://pbs.twimg.com/**', (r) =>
      r.fulfill({ contentType: 'image/jpeg', body: poster, headers: { 'access-control-allow-origin': '*' } }),
    );
    let bgm = 0;
    await ctx.route('https://api.bgm.tv/**', () => void bgm++); // 不响应，模拟服务挂起
    if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker');
    const p = await ctx.newPage();
    await p.goto('https://x.com/home');
    const btn = p.locator('[data-testid="tweetPhoto"]:not(#gif):not(#small) .xal-btn').first();
    await btn.waitFor();
    await btn.click();
    const t0 = Date.now();
    await p.locator('.xal-card[data-state="ok"]').waitFor({ timeout: 60000 });
    const first = Date.now() - t0;
    const svr = (s) => p.locator(`.xal-svr[data-svr="${s}"]`).getAttribute('data-state');
    const atFirst = await svr('bangumi');
    await p.locator('.xal-svr[data-svr="bangumi"][data-state="fail"]').waitFor({ timeout: 30000 });
    await p.waitForFunction(
      () => !document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-pending, .xal-char-load'),
      null,
      { timeout: 30000 },
    );
    const done = Date.now() - t0;
    await p.locator('.xal-card').screenshot({ path: `${out}/card-bgm-down.png` });
    const tm = await svr('tracemoe');
    if (tm !== 'ok') throw new Error(`[bgm-down] trace.moe 状态 ${tm}`);
    const chips = await p.locator('.xal-char').count();
    const avs = await p.locator('.xal-char > .xal-char-av').count();
    if (chips !== avs) throw new Error(`[bgm-down] 角色头像位缺失 ${avs}/${chips}`);
    const hs = await p.locator('.xal-char').evaluateAll((els) => [...new Set(els.map((e) => e.getBoundingClientRect().height))]);
    if (hs.length > 1) throw new Error(`[bgm-down] 角色标签高度不一致 ${hs.join(',')}`);
    const note = (await p.locator('.xal-note-fail').allTextContents()).join(' | ');
    console.log(`[bgm-down] first ${first}ms (bangumi=${atFirst}), done ${done}ms, bgm requests=${bgm}, chips=${chips}, note=${note}`);
    if (!bgm) throw new Error('[bgm-down] 未拦截到 Bangumi 请求（service worker 请求未经过 route）');
    await ctx.close();
  }
}

/**
 * 右键识别（任意网站）+ 卡片无障碍 + 同作品去重 + 收藏集交互。
 * 所有外部服务都用 route 模拟，不消耗 trace.moe 额度，结果确定。
 */
class Lens {
  static SITE = 'https://example.test/page';
  static IMG = 'https://img.example.test/a.jpg';
  static VID = 'https://img.example.test/v.mp4';
  static TITLE = '请问您今天要来点兔子吗？？';

  static html() {
    return `<!doctype html><html><body style="margin:0;background:#fff">
<img id="pic" src="${Lens.IMG}" style="width:480px;height:270px;display:block">
<video id="vid" src="${Lens.VID}" muted playsinline style="width:480px;height:270px"></video>
</body></html>`;
  }

  static subject(id) {
    const s2 = { id: 123568, name: 'ご注文はうさぎですか？？', name_cn: Lens.TITLE, date: '2015-10-10', platform: 'TV',
      images: { common: 'https://lain.bgm.tv/c.jpg' }, rating: { score: 7.5 } };
    if (id === 123568) return s2;
    return { id, name: `作品${id}`, name_cn: `作品${id}`, date: '2009-04-02', platform: 'TV', images: { common: 'https://lain.bgm.tv/c.jpg' } };
  }

  static async mock(ctx) {
    const json = (r, body) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    await ctx.route('https://example.test/**', (r) => r.fulfill({ contentType: 'text/html', body: Lens.html() }));
    await ctx.route('https://img.example.test/**', (r) => {
      const v = r.request().url().endsWith('.mp4');
      return r.fulfill({ contentType: v ? 'video/mp4' : 'image/jpeg', body: v ? clip : poster, headers: { 'access-control-allow-origin': '*' } });
    });
    await ctx.route('https://api.trace.moe/**', (r) => {
      const u = r.request().url();
      if (u.includes('/me')) return json(r, { id: 'ip', quota: 100, quotaUsed: 5 });
      if (u.includes('/search')) {
        return json(r, { error: '', result: [{
          anilist: { id: 21034, title: { native: 'ご注文はうさぎですか？？', chinese: Lens.TITLE }, isAdult: false, format: 'TV',
            startDate: { year: 2015, month: 10 }, coverImage: { large: 'https://s4.anilist.co/c.jpg' }, siteUrl: 'https://anilist.co/anime/21034' },
          filename: '', episode: 3, from: 60, to: 62, at: 61, similarity: 0.97,
          video: 'https://api.trace.moe/video/x', image: 'https://api.trace.moe/image/x' }] });
      }
      const v = u.includes('/video/');
      return r.fulfill({ contentType: v ? 'video/mp4' : 'image/jpeg', body: v ? clip : poster });
    });
    await ctx.route('https://s4.anilist.co/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: poster }));
    await ctx.route('https://lain.bgm.tv/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: poster }));
    await ctx.route('https://api.animetrace.com/**', (r) => json(r, { code: 0, ai: false, data: [
      { box: [0, 0, 1, 1], not_confident: false, character: [{ work: 'ご注文はうさぎですか？', character: '香風智乃' }] }] }));
    await ctx.route('https://api.bgm.tv/**', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/v0/search/subjects') return json(r, { data: [Lens.subject(123568)] });
      if (u.pathname === '/v0/search/characters') return json(r, { data: [] });
      if (u.pathname.endsWith('/characters')) return json(r, []);
      const m = u.pathname.match(/^\/v0\/subjects\/(\d+)$/);
      if (m) return json(r, Lens.subject(Number(m[1])));
      return r.fulfill({ status: 404, body: '' });
    });
  }

  /** 等卡片出结果（data-state 不再是 loading） */
  static async settle(p) {
    await p.waitForFunction(
      () => {
        const c = document.querySelector('#xal-host')?.shadowRoot?.querySelector('.xal-card');
        return c && c.getAttribute('data-state') !== 'loading' && c.querySelector('.xal-list')?.getAttribute('aria-busy') !== 'true';
      },
      null,
      { timeout: 30000 },
    ).catch(async (e) => {
      const st = await p.evaluate(() => {
        const r = document.querySelector('#xal-host')?.shadowRoot;
        return { host: !!r, state: r?.querySelector('.xal-card')?.getAttribute('data-state'), busy: r?.querySelector('.xal-list')?.getAttribute('aria-busy'),
          err: r?.querySelector('.xal-err-msg')?.textContent, items: r?.querySelectorAll('.xal-item').length };
      });
      throw new Error(`[lens] 等待结果超时 ${JSON.stringify(st)} ${e.message}`);
    });
    const state = await p.locator('.xal-card').getAttribute('data-state');
    if (state !== 'ok') throw new Error(`[lens] card state=${state} msg=${await p.locator('.xal-err-msg').textContent()}`);
  }

  static async run() {
    const ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    await Lens.mock(ctx);
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2];
    const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && console.log(`[lens] page console: ${m.text()}`));
    const dialogs = [];
    ctx.on('page', (pg) => pg.on('dialog', (d) => (dialogs.push(d.message()), d.dismiss())));
    p.on('dialog', (d) => (dialogs.push(d.message()), d.dismiss()));
    await p.goto(Lens.SITE);
    await p.waitForFunction(() => document.querySelector('#vid').readyState >= 2 && document.querySelector('#pic').complete);
    if (await p.locator('.xal-btn').count()) throw new Error('[lens] 非 X 页面出现了识别按钮');

    // 同一作品先以 AnimeTrace 单独收藏过（bgm- 主键）：卡片应显示已收藏
    await sw.evaluate(async () => {
      await chrome.storage.local.set({ 'fav:bgm-123568': { key: 'bgm-123568', anilistId: 0, bgmId: 123568, title: '旧条目',
        native: '', cover: '', episode: '', at: 0, similarity: 0, tweetUrl: '', savedAt: '2020-01-01T00:00:00.000Z', note: '旧备注',
        kind: '', genres: [], srcs: ['animetrace'], chars: ['香風智乃'] } });
    });

    const menu = (src, kind) =>
      sw.evaluate(async ({ src, kind, site }) => {
        const [tab] = await chrome.tabs.query({ url: site });
        await self.__xalMenu({ menuItemId: 'xal-lens', srcUrl: src, mediaType: kind, frameId: 0, editable: false, pageUrl: site }, tab);
      }, { src, kind, site: Lens.SITE });

    // 图片
    await menu(Lens.IMG, 'image');
    await Lens.settle(p);
    const title = await p.locator('.xal-title').first().textContent();
    if (title !== Lens.TITLE) throw new Error(`[lens-image] 标题 ${title}`);
    const a11y = await p.evaluate(() => {
      const root = document.querySelector('#xal-host').shadowRoot;
      const card = root.querySelector('.xal-card');
      return {
        role: card.getAttribute('role'),
        label: card.getAttribute('aria-label'),
        focus: document.activeElement?.id === 'xal-host' && !!root.activeElement,
        close: root.querySelector('.xal-close').getAttribute('aria-label'),
        live: root.querySelector('.xal-sr[aria-live="polite"]')?.textContent,
        cmp: root.querySelector('.xal-cmp-btn')?.getAttribute('aria-expanded'),
        pressed: root.querySelector('.xal-fav').getAttribute('aria-pressed'),
      };
    });
    if (a11y.role !== 'dialog' || !a11y.label || !a11y.focus || !a11y.close || a11y.cmp !== 'false') {
      throw new Error(`[lens-a11y] ${JSON.stringify(a11y)}`);
    }
    if (!/识别完成/.test(a11y.live ?? '')) throw new Error(`[lens-a11y] 未播报完成 ${a11y.live}`);
    if (a11y.pressed !== 'true') throw new Error('[lens-dedupe] 同作品已以 bgm- 主键收藏，卡片未显示已收藏');
    await p.locator('.xal-cmp-btn').first().click();
    if ((await p.locator('.xal-cmp-btn').first().getAttribute('aria-expanded')) !== 'true') throw new Error('[lens-a11y] aria-expanded 未更新');
    const quota = await p.locator('.xal-quota').textContent();
    if (!quota.includes('5/100')) throw new Error(`[lens] 额度未以 /me 为准: ${quota}`);

    // 取消收藏删除的是实际存储的 bgm- 条目；再收藏存为 trace.moe 条目
    const fav = p.locator('.xal-fav').first();
    await fav.click();
    await p.waitForFunction(() => document.querySelector('#xal-host').shadowRoot.querySelector('.xal-fav').getAttribute('aria-pressed') === 'false');
    await fav.click();
    await p.waitForFunction(() => document.querySelector('#xal-host').shadowRoot.querySelector('.xal-fav').getAttribute('aria-pressed') === 'true');
    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('fav:')));
    if (keys.includes('fav:bgm-123568') || !keys.includes('fav:21034')) throw new Error(`[lens-dedupe] 存储键 ${keys.join(',')}`);
    const saved = await sw.evaluate(async () => (await chrome.storage.local.get('fav:21034'))['fav:21034']);
    if (saved.tweetUrl !== Lens.SITE) throw new Error(`[lens] 来源页面 ${saved.tweetUrl}`);

    // Esc 关闭，焦点离开卡片
    await p.keyboard.press('Escape');
    if (await p.locator('#xal-host').isVisible()) throw new Error('[lens-a11y] Esc 未关闭卡片');
    await p.screenshot({ path: `${out}/lens-closed.png` });

    // 视频（无 crossorigin，走重新加载截帧）：AnimeTrace 合并到同一条
    await menu(Lens.VID, 'video');
    await Lens.settle(p);
    if (!(await p.locator('#xal-host').isVisible())) throw new Error('[lens-video] 卡片未重新显示');
    const srcs = await p.locator('.xal-item').first().locator('.xal-src').allTextContents();
    if (!srcs.includes('AnimeTrace') || !srcs.includes('trace.moe')) throw new Error(`[lens-video] 来源 ${srcs.join('|')}`);
    await p.locator('.xal-card').screenshot({ path: `${out}/lens-video.png` });
    console.log(`[lens] image + video ok: ${title} | ${quota} | srcs=${srcs.join(',')}`);

    // 收藏集：旧版整表数据迁移 + 补全、筛选、备注编辑不被重绘打断、删除撤销
    await sw.evaluate(async () => {
      const base = { native: '', cover: '', episode: '1', at: 10, similarity: 0.9, tweetUrl: '', note: '' };
      await chrome.storage.local.set({ favs: {
        legacy: { ...base, key: 'legacy', anilistId: 1, bgmId: 1424, title: '旧收藏', savedAt: '2020-01-01T00:00:00.000Z' },
        old2: { ...base, key: 'old2', anilistId: 2, bgmId: null, title: '另一条', savedAt: '2019-01-01T00:00:00.000Z', kind: '剧场版', genres: ['日常'] },
      } });
    });
    const col = await ctx.newPage();
    col.on('dialog', (d) => (dialogs.push(d.message()), d.dismiss()));
    await col.goto(`chrome-extension://${id}/collection.html`);
    await col.locator('.col-card', { hasText: '旧收藏' }).locator('.col-kind').waitFor({ timeout: 15000 });
    const left = await sw.evaluate(async () => 'favs' in (await chrome.storage.local.get('favs')));
    if (left) throw new Error('[col] 旧版 favs 未迁移');
    if ((await col.locator('.col-card').count()) !== 3) throw new Error(`[col] 条目数 ${await col.locator('.col-card').count()}`);

    await col.locator('#col-f-kind').selectOption('剧场版');
    const cnt = await col.locator('#col-count').textContent();
    if ((await col.locator('.col-card').count()) !== 1 || !cnt.includes('显示 1')) throw new Error(`[col-filter] 形式筛选 ${cnt}`);
    await col.locator('#col-f-kind').selectOption('');
    await col.locator('#col-f-src').selectOption('multi');
    const multi = await col.locator('.col-name').allTextContents();
    if (multi.length !== 1 || multi[0] !== Lens.TITLE) throw new Error(`[col-filter] 多源筛选 ${multi.join('|')}`);
    await col.locator('#col-f-src').selectOption('all');
    await col.locator('#col-f-sort').selectOption('old');
    const first = await col.locator('.col-name').first().textContent();
    if (first !== '另一条') throw new Error(`[col-sort] 最早收藏排序首条 ${first}`);
    await col.locator('#col-f-sort').selectOption('new');

    // 编辑备注时别的条目更新（触发重绘），输入内容与焦点保留；停止输入后自动保存
    const note = col.locator('.col-card', { hasText: '另一条' }).locator('.col-note');
    await note.click();
    await note.pressSequentially('正在输入');
    await sw.evaluate(async () => {
      const r = await chrome.storage.local.get('fav:legacy');
      await chrome.storage.local.set({ 'fav:legacy': { ...r['fav:legacy'], note: '后台修改' } });
    });
    await col.waitForTimeout(300);
    const kept = await col.evaluate(() => ({ v: document.activeElement?.value, cls: document.activeElement?.className }));
    if (kept.v !== '正在输入' || kept.cls !== 'col-note') throw new Error(`[col-note] 重绘打断了输入 ${JSON.stringify(kept)}`);
    await col.waitForTimeout(900);
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('fav:old2'))['fav:old2'].note);
    if (stored !== '正在输入') throw new Error(`[col-note] 自动保存 ${stored}`);
    await col.locator('#col-search').click(); // 失焦后补上被推迟的重绘
    await col.waitForFunction(
      () => [...document.querySelectorAll('.col-card')].find((c) => c.textContent.includes('旧收藏'))?.querySelector('.col-note').value === '后台修改',
      null,
      { timeout: 5000 },
    );

    // 删除：无确认框，提示条可撤销
    await col.locator('.col-card', { hasText: '另一条' }).locator('.col-del').click();
    await col.locator('.col-card', { hasText: '另一条' }).waitFor({ state: 'detached' });
    await col.locator('#col-toast-act').click();
    await col.locator('.col-card', { hasText: '另一条' }).waitFor();
    const restored = await col.locator('.col-card', { hasText: '另一条' }).locator('.col-note').inputValue();
    if (restored !== '正在输入') throw new Error(`[col-undo] 恢复后备注 ${restored}`);
    await col.screenshot({ path: `${out}/collection-lens.png`, fullPage: true });
    if (dialogs.length) throw new Error(`[col] 出现了原生弹窗: ${dialogs.join(' | ')}`);
    console.log('[lens] collection: migrate + filter + sort + note + undo ok');
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
if (!only || only === 'down') await Down.run();
if (!only || only === 'lens') await Lens.run();
console.log('E2E PASS');
