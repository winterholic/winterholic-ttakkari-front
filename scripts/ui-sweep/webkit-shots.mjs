// WebKit(= iOS Safari 와 같은 엔진)으로 모바일 화면을 열어 스크린샷과 가로 넘침 수치를 남긴다.
// 왜: Chrome 에뮬레이션만으로 "통과"한 화면이 실기기 Safari 에서 깨졌다(input[type=date] 고유 폭, 파일 선택 메뉴 위치 등).
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/webkit-shots.mjs --url=http://127.0.0.1:5399 --out=/tmp/shots --tag=before [--routes=/notifications,/library] [--no-fail]
// 기기: iPhone 프리셋의 UA·배율·터치를 쓰고 390×844(iPhone 14/15)·320×568(iPhone SE) 를 라이트·다크로 연다.
// safe-area: WebKit 에는 inset 에뮬레이션이 없어 CSS·JS 응답의 env(safe-area-inset-*) 를 고정 px 로 바꿔 흉내 낸다(상단 59 = Dynamic Island 기기, SE 는 20).
/* global document, innerWidth, getComputedStyle */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5399').replace(/\/$/, '');
const out = resolve(String(args.out ?? '/tmp/webkit-shots'));
const tag = String(args.tag ?? 'run');
const ROUTES = String(args.routes ?? [
  '/meetings/new', '/memos/new', '/library', '/notifications', '/context-library?tab=overview', '/context-library?tab=structure',
  '/context-library?tab=search', '/context-library?tab=quality', '/context-library?tab=evidence', '/pms/p1/board', '/chat', '/more', '/settings', '/memos', '/meetings', '/pms', '/tasks', '/files', '/checklists', '/calendar', '/weather',
].join(',')).split(',');

const { webkit, devices } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const stub = (await import(pathToFileURL(resolve(new URL('./stub.mjs', import.meta.url).pathname)).href)).default;

const profiles = [
  { name: '390', device: devices['iPhone 14'], viewport: { width: 390, height: 844 }, inset: { top: 59, bottom: 34 } },
  { name: '320', device: devices['iPhone SE'], viewport: { width: 320, height: 568 }, inset: { top: 20, bottom: 0 } },
  // 360(흔한 안드로이드 폭)과 데스크톱은 --widths=360,1440 으로 고를 때만 연다. 기본 실행(390·320)은 그대로 둔다.
  { name: '360', device: devices['iPhone SE'], viewport: { width: 360, height: 740 }, inset: { top: 20, bottom: 0 }, optIn: true },
  { name: '1440', device: devices['Desktop Safari'], viewport: { width: 1440, height: 900 }, inset: { top: 0, bottom: 0 }, optIn: true },
];
const schemes = args.schemes ? String(args.schemes).split(',') : ['light', 'dark'];
const only = args.widths ? String(args.widths).split(',') : null;

const browser = await webkit.launch();
const rows = [];
// 화면 본문(.tk-screen__body)이 옆으로 밀리면(scrollWidth > clientWidth) 문서 scrollWidth 가 정상이어도 실패다(맥락 도서관 실기기 증상)
const scrollerFits = (s) => { if (!s || s === '-') return true; const [a, b] = s.split('/').map(Number); return a <= b; };
await mkdir(out, { recursive: true });
for (const p of profiles) {
  if (only ? !only.includes(p.name) : p.optIn) continue;
  for (const scheme of schemes) {
    const ctx = await browser.newContext({ ...p.device, viewport: p.viewport, colorScheme: scheme, serviceWorkers: 'block' });
    // env(safe-area-inset-*) 를 px 로 치환한다. 개발 서버는 CSS 를 JS 모듈 문자열로도 내보내므로 JS 응답도 바꾼다.
    await ctx.route((u) => /\.(css|tsx?|jsx?|mjs)(\?|$)/.test(u.pathname) || u.pathname.includes('/@') || u.pathname.includes('/node_modules/'), async (route) => {
      const res = await route.fetch();
      const type = res.headers()['content-type'] ?? '';
      if (!/css|javascript/.test(type)) return route.fulfill({ response: res });
      const text = (await res.text())
        .replaceAll('env(safe-area-inset-top)', `${p.inset.top}px`).replaceAll('env(safe-area-inset-bottom)', `${p.inset.bottom}px`)
        .replaceAll('env(safe-area-inset-left)', '0px').replaceAll('env(safe-area-inset-right)', '0px');
      return route.fulfill({ response: res, body: text });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await stub(ctx, page, base);
    for (const route of ROUTES) {
      let m;
      try {
        await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        m = await page.evaluate(() => {
          const de = document.documentElement;
          let culprit = '';
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.right > innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
              let clipped = false;
              for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).overflowX !== 'visible') { clipped = true; break; }
              if (!clipped) culprit = el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.') + ` right=${Math.round(r.right)}`;
            }
          }
          const scroller = document.querySelector('.tk-screen__body');
          // iOS 는 파일 선택 메뉴를 input 상자 기준으로 띄운다. display:none 이거나 버튼과 어긋나면 엉뚱한 곳에 뜬다.
          const fileInputs = [...document.querySelectorAll('input[type=file]')].map((el) => { const r = el.getBoundingClientRect(); const b = el.parentElement?.querySelector('button')?.getBoundingClientRect(); return { shown: r.width > 0 && r.height > 0, onButton: !!b && Math.abs(r.left - b.left) < 1 && Math.abs(r.top - b.top) < 1 && Math.abs(r.width - b.width) < 1 && Math.abs(r.height - b.height) < 1 }; });
          return { fileInputs, scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth, innerWidth, bodyScroller: scroller ? scroller.scrollWidth + '/' + scroller.clientWidth : '-', culprit };
        });
        const file = `${tag}-${route.replace(/[^\w.-]+/g, '_')}-${p.name}-${scheme}.png`;
        await page.screenshot({ path: join(out, file) });
        rows.push({ route, width: p.name, scheme, file, ...m, ok: m.scrollWidth <= m.innerWidth && m.bodyScrollWidth <= m.innerWidth && m.fileInputs.every((x) => x.shown && x.onButton) && scrollerFits(m.bodyScroller) });
      } catch (e) { rows.push({ route, width: p.name, scheme, error: String(e.message).split('\n')[0], ok: false }); }
    }
    for (const e of errors) rows.push({ route: '(pageerror)', width: p.name, scheme, error: e, ok: false });
    await ctx.close();
  }
}
await browser.close();
await writeFile(join(out, `${tag}-metrics.json`), JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.width}/${r.scheme} ${r.route} scrollWidth=${r.scrollWidth}/${r.innerWidth} body=${r.bodyScrollWidth} scroller=${r.bodyScroller}${r.fileInputs?.length ? ' fileInputs=' + JSON.stringify(r.fileInputs) : ''}${r.culprit ? ' culprit=' + r.culprit : ''}${r.error ? ' ' + r.error : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(`WebKit 캡처 ${rows.length}건, 가로 넘침/오류 ${bad}건 → ${out}`);
process.exit(bad && !args['no-fail'] ? 1 : 0);
