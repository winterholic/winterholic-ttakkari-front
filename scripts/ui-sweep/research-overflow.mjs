// AI Research Lab 화면의 가로 넘침 점검(320/390/768/1024/1440). 디자인 시스템 layout 검사기가 실행되지 않는 환경에서 쓰는 간이 검사다.
// 페이지가 가로로 밀리는지, 가로 스크롤 상자 밖으로 새는 요소가 있는지, 터치 기기에서 44 미만 버튼이 있는지 센다.
// 디자인 시스템 Select 트리거(40)는 앱 전체 공통이라 제외한다.
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/research-overflow.mjs --url=http://127.0.0.1:5481
/* global document, window, getComputedStyle */
import stub from './stub.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5481').replace(/\/$/, '');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const URLS = [
  '/research?view=dashboard', '/research?view=dashboard&study=s-llm', '/research?view=library', '/research?view=library&target=llm', '/research?view=library&method=kv-cache-quantization',
  '/research?view=designer&study=s-llm&method=kv-cache-quantization', '/research?view=monitor&study=s-llm&experiment=e-llm', '/research?view=monitor&study=s-llm&experiment=e-ext',
  '/research?view=analysis&study=s-llm&experiment=e-llm', '/research?view=analysis&study=s-tts&experiment=e-tts', '/research?view=analysis&study=s-rag&experiment=e-rag', '/research?view=records&study=s-llm', '/research?view=records&study=s-tts',
];
const WIDTHS = [320, 390, 768, 1024, 1440];
const browser = await chromium.launch({ channel: 'chrome' });
let bad = 0;
for (const w of WIDTHS) {
  const touch = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: touch, hasTouch: touch });
  await stub(ctx);
  for (const u of URLS) {
    const page = await ctx.newPage();
    await page.goto(base + u, { waitUntil: 'networkidle' });
    await page.waitForSelector('.research', { timeout: 15000 });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const root = document.documentElement;
      const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) return true; } return false; };
      const leaks = [...document.querySelectorAll('.research *, dialog[open] *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 1 && !clipped(el); }).slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40));
      const small = window.matchMedia('(pointer: coarse)').matches ? [...document.querySelectorAll('.research button:not(.tk-select__trigger), .research input:not([type=checkbox]):not([type=radio]), .research select')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43; }).slice(0, 3).map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24) + ' ' + Math.round(el.getBoundingClientRect().height)) : [];
      return { over: root.scrollWidth - root.clientWidth, leaks, small };
    });
    const msg = [r.over > 1 ? '페이지 가로 넘침 ' + r.over : '', r.leaks.length ? '스크롤 상자 밖 요소: ' + r.leaks.join(', ') : '', r.small.length ? '터치 높이 부족: ' + r.small.join(' | ') : ''].filter(Boolean).join(' · ');
    if (msg) { bad += 1; console.log('WARN ' + w + ' ' + u + ' ' + msg); }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? '경고 ' + bad + '건' : '가로 넘침·터치 높이 문제 없음 (' + URLS.length + '개 화면 × ' + WIDTHS.length + '개 폭)');
process.exit(bad ? 1 : 0);
