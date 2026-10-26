// AI Research Lab v2 화면 스크린샷(데스크톱 1440·모바일 390). 실제 서버·연구 데이터 없이 fixtures-research.mjs 의 합성 응답을 쓴다.
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/research-shots.mjs --url=http://127.0.0.1:5481 --out=docs/research-v2-screens [--only=library,designer]
// --url 은 `VITE_API_BASE=<같은 주소> vite --port 5481` 같은 dev 서버다. API 는 stub.mjs 가 가로챈다.
/* global document */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import stub from './stub.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5481').replace(/\/$/, '');
const out = resolve(String(args.out ?? 'docs/research-v2-screens'));
const only = args.only ? String(args.only).split(',') : null;
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

/** 청취용 샘플 대신 쓰는 0.5초 사인파 WAV. 음성 샘플 재생 막대가 실제로 그려지는지만 본다. */
function wav() {
  const rate = 22050; const n = rate / 2; const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 4000), 44 + i * 2);
  return buf;
}

const settle = (p) => p.waitForTimeout(700);
const SCENARIOS = {
  '01-dashboard': { url: '/research?view=dashboard' },
  '02-dashboard-study': { url: '/research?view=dashboard&study=s-llm' },
  '03-library': { url: '/research?view=library' },
  '04-library-filtered': { url: '/research?view=library&target=llm&goal=memory_vram,latency_ttft' },
  '05-library-status': { url: '/research?view=library&status=adapter_required,environment_unavailable' },
  '06-library-detail': { dialog: true, url: '/research?view=library&method=kv-cache-quantization' },
  '07-library-detail-params': { dialog: true, url: '/research?view=library&method=kv-cache-quantization', act: (p) => p.getByRole('tab', { name: '파라미터' }).click() },
  '08-library-detail-evidence': { dialog: true, url: '/research?view=library&method=kv-cache-quantization', act: (p) => p.getByRole('tab', { name: '근거' }).click() },
  '09-library-detail-relations': { dialog: true, url: '/research?view=library&method=kv-cache-quantization', act: (p) => p.getByRole('tab', { name: /관계/ }).click() },
  '10-library-new-method': { dialog: true, url: '/research?view=library&method=new' },
  '11-library-filter-drawer': { url: '/research?view=library', mobileOnly: true, dialog: true, act: (p) => p.getByRole('button', { name: /필터 열기/ }).click() },
  '12-designer': { url: '/research?view=designer&study=s-llm&method=kv-cache-quantization&scope=personal', act: async (p) => {
    await p.getByLabel(/벤치마크 프롬프트/).fill('다음 회의록을 세 문장으로 요약해 주세요.');
    const k = p.locator('.rs-param', { hasText: 'K 캐시 양자화 타입' }); await k.getByRole('button', { name: '값 여러 개 탐색' }).click();
    await p.waitForTimeout(1200);
  } },
  '13-designer-json': { url: '/research?view=designer&study=s-llm&method=kv-cache-quantization', act: (p) => p.getByText('고급 (JSON)', { exact: true }).click() },
  '14-monitor': { url: '/research?view=monitor&study=s-llm&experiment=e-llm' },
  '15-monitor-running': { url: '/research?view=monitor&study=s-rag&experiment=e-rag' },
  '16-monitor-run-failed': { dialog: true, url: '/research?view=monitor&study=s-llm&experiment=e-llm&run=r-l5' },
  '17-monitor-external': { url: '/research?view=monitor&study=s-llm&experiment=e-ext' },
  '18-analysis-llm': { url: '/research?view=analysis&study=s-llm&experiment=e-llm' },
  '19-analysis-tts': { url: '/research?view=analysis&study=s-tts&experiment=e-tts', act: async (p) => { await p.getByRole('button', { name: /STT 재인식 CER/ }).first().click(); } },
  '20-analysis-repeat': { url: '/research?view=analysis&study=s-rag&experiment=e-rag' },
  '21-records-llm': { url: '/research?view=records&study=s-llm' },
  '22-records-tts': { url: '/research?view=records&study=s-tts' },
  '23-records-empty': { url: '/research?view=records&study=s-rag' },
};

const profiles = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && !only.some((o) => name.includes(o))) continue;
  for (const prof of profiles) {
    if (sc.mobileOnly && prof.name !== 'mobile') continue;
    const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: prof.isMobile, hasTouch: prof.hasTouch, colorScheme: 'light' });
    await stub(ctx);
    await ctx.route((u) => /^\/api\/artifacts\/[^/]+\/content$/.test(u.pathname), (route) => route.fulfill({ body: wav(), contentType: 'audio/wav', headers: { 'access-control-allow-origin': route.request().headers().origin ?? '*', 'access-control-allow-credentials': 'true' } }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    try {
      await page.goto(base + sc.url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.research', { timeout: 15000 });
      await settle(page);
      if (sc.act) { await sc.act(page); await settle(page); }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      // 본문 스크롤이 셸 안쪽에 있어 fullPage 만으로는 첫 화면만 찍힌다. 모달이 없는 장면은 셸 높이 제한을 풀어 전체를 찍는다.
      if (!sc.dialog) await page.addStyleTag({ content: 'html, body, .tk-app, .tk-app__main, .tk-screen, .tk-screen__body { height: auto !important; max-height: none !important; overflow: visible !important; }' });
      await page.screenshot({ path: join(out, name + '-' + prof.name + '.png'), fullPage: !sc.dialog });
      const note = (overflow > 1 ? ' 가로 넘침 ' + overflow + 'px' : '') + (errors.length ? ' 오류 ' + errors.length + '건: ' + errors[0].slice(0, 120) : '');
      if (note) failures += 1;
      console.log((note ? 'WARN ' : 'ok   ') + name + ' ' + prof.name + note);
    } catch (e) {
      failures += 1;
      console.log('FAIL ' + name + ' ' + prof.name + ' ' + String(e).split('\n')[0]);
      await page.screenshot({ path: join(out, name + '-' + prof.name + '-FAIL.png') }).catch(() => {});
    }
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
