/**
 * 긴 대화(합성 140 Run, 처음 40개 렌더) 초기 렌더·반복 스크롤 비교. 같은 mock·뷰포트·입력으로 변형만 바꾼다.
 *   PLAYWRIGHT_CORE=... node scripts/e2e/chat-scroll/perf.mjs --browser=chromium|webkit --variant=current|content-visibility [--runs=3] [--json=<파일>]
 *   훅 변형: CHAT_SCROLL_HOOK_VARIANT=<useThreadFollow 대체 파일 절대 경로> 를 주고 --variant 라벨만 따로 붙인다(--label=hook-1b4275b).
 * 해석 주의: headless 단일 머신 측정이라 절대값이 아니라 같은 실행 환경 안의 상대 비교다. 다른 프로세스 부하는 통제하지 않았다.
 */
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { startMockApi, DESK } from './mock-api.mjs';
import { createResources, e2ePorts, hookAlias, loadPlaywright } from './runtime.mjs';
import { PAGE_TOOLS, makeDriver, trackRequests } from './scroll-lib.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? d;
const browserName = arg('browser', 'chromium');
const variant = arg('variant', 'current');
const label = arg('label', variant);
const runs = Number(arg('runs', 3));
const jsonPath = arg('json');

// 변형: 1b4275b 이전(9f1ce73)의 CSS 조건. 앞쪽 끝난 메시지를 화면 밖에서 렌더링 생략한다.
const CONTENT_VISIBILITY = `
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '.tk-thread__inner > .tk-message:not([aria-busy]) { content-visibility: auto; contain-intrinsic-size: auto 180px; }';
    document.head.appendChild(st);
  });
`;
const LONGTASK = `
  window.__long = { count: 0, total: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__long.count++; window.__long.total += e.duration; } }).observe({ type: 'longtask', buffered: true }); } catch {}
`;
const FRAMES = `
  window.__frames = { on: false, t: [] };
  (function loop(prev) { requestAnimationFrame((now) => { if (window.__frames.on && prev) window.__frames.t.push(now - prev); loop(now); }); })(0);
`;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const resources = createResources();
try {
  const { chromium, webkit, devices } = await loadPlaywright();
  const ports = e2ePorts();
  const mock = resources.add(await startMockApi({ port: ports.mockPort }), (m) => m.close());
  process.env.VITE_API_BASE = mock.url;
  process.env.TTAKKARI_NO_ENV_FILE = '1';
  const alias = hookAlias();
  const vite = resources.add(await createServer({
    server: { port: ports.vitePort, strictPort: true, host: '127.0.0.1' },
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(mock.url) },
    ...(alias ? { resolve: { alias } } : {}),
    configFile: './vite.config.ts',
    logLevel: 'error',
  }), (v) => v.close());
  await vite.listen();
  const bt = browserName === 'webkit' ? webkit : chromium;
  const browser = resources.add(await bt.launch({ headless: true }), (b) => b.close());
  const options = browserName === 'webkit' ? { ...devices['iPhone 14'], isMobile: false, hasTouch: false } : { viewport: { width: 1280, height: 800 } };
  const url = `http://127.0.0.1:${ports.vitePort}/chat/${DESK}`;

  const samples = [];
  for (let i = 0; i < runs + 1; i++) { // 첫 번째는 Vite 의존성 최적화·캐시 워밍업이라 버린다
    await fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify({ op: 'reset' }) });
    const context = await browser.newContext(options);
    await context.addInitScript(PAGE_TOOLS);
    await context.addInitScript(LONGTASK + FRAMES);
    if (variant === 'content-visibility') await context.addInitScript(CONTENT_VISIBILITY);
    const page = await context.newPage();
    const log = trackRequests(page);
    const d = makeDriver(page, log, { vw: options.viewport.width, vh: options.viewport.height });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.tk-thread .tk-message').length >= 80, null, { timeout: 30000 });
    const tMessages = Date.now() - t0;
    await d.quiesce({ timeout: 30000 });
    const tReady = Date.now() - t0;
    const nav = await page.evaluate(() => ({ long: window.__long, heap: performance.memory?.usedJSHeapSize ?? null }));
    // 반복 스크롤: 신뢰된 휠로 위로 20번, 아래로 20번(±500px), 입력 사이 대기 없음. 프레임 간격과 긴 작업을 잰다.
    await page.evaluate(() => { window.__frames.t = []; window.__frames.on = true; window.__long0 = { ...window.__long }; });
    const c = await d.center();
    await page.mouse.move(c.x, c.y);
    const s0 = Date.now();
    for (let k = 0; k < 20; k++) await page.mouse.wheel(0, -500);
    for (let k = 0; k < 20; k++) await page.mouse.wheel(0, 500);
    await d.settle();
    const scrollMs = Date.now() - s0;
    const fr = await page.evaluate(() => { window.__frames.on = false; return { t: window.__frames.t, long: { count: window.__long.count - window.__long0.count, total: window.__long.total - window.__long0.total } }; });
    const info = await d.info();
    samples.push({
      toMessagesMs: tMessages, toReadyMs: tReady, loadLongTasks: nav.long, heapMB: nav.heap && Math.round(nav.heap / 1048576),
      scrollMs, frames: fr.t.length, frameP50: pct(fr.t, 0.5), frameP95: pct(fr.t, 0.95), frameMax: Math.max(...fr.t, 0),
      over32: fr.t.filter((x) => x > 32).length, scrollLongTasks: fr.long, eventsRequested: new Set(log.events).size, endTop: Math.round(info.top),
    });
    await context.close();
  }
  const kept = samples.slice(1);
  const summary = {
    label, variant, browser: browserName, hookVariant: process.env.CHAT_SCROLL_HOOK_VARIANT ?? null, runs: kept.length,
    toMessagesMs: median(kept.map((s) => s.toMessagesMs)), toReadyMs: median(kept.map((s) => s.toReadyMs)),
    loadLongTaskMs: median(kept.map((s) => Math.round(s.loadLongTasks?.total ?? 0))),
    heapMB: median(kept.map((s) => s.heapMB ?? 0)),
    scrollMs: median(kept.map((s) => s.scrollMs)), frameP50: median(kept.map((s) => s.frameP50)), frameP95: median(kept.map((s) => s.frameP95)),
    over32: median(kept.map((s) => s.over32)), scrollLongTaskMs: median(kept.map((s) => Math.round(s.scrollLongTasks.total))),
    eventsRequested: median(kept.map((s) => s.eventsRequested)), samples: kept,
  };
  console.log(JSON.stringify({ ...summary, samples: undefined }));
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(summary, null, 1));
} finally {
  await resources.closeAll();
}
