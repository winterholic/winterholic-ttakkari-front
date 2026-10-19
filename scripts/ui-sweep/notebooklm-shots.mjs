// NotebookLM 플랫폼 화면 확인용 스크린샷. 실제 Google 데이터가 없으므로 src/features/notebooklm/fixtures.ts 의 합성 데이터를 쓴다.
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/notebooklm-shots.mjs --url=http://127.0.0.1:5399 --out=/tmp/nlm [--only=ready,detail] [--browser=chromium|webkit]
// --url 은 `VITE_API_BASE=<같은 주소> vite --port 5399` 같은 dev 서버다. API 는 모두 이 스크립트가 가로채 합성 응답을 준다.
/* global document */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { body as baseBody } from './stub.mjs';
import { NOTEBOOK, QUERY_RESULT, authStatus, job } from '../../src/features/notebooklm/fixtures.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5399').replace(/\/$/, '');
const out = resolve(String(args.out ?? '/tmp/nlm-shots'));
const only = args.only ? String(args.only).split(',') : null;
const engine = String(args.browser ?? 'chromium');
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const READY = authStatus({
  state: 'ready', message: null, logged_in: true, last_ok_at: '2026-10-19T09:10:00Z', last_checked_at: '2026-10-19T09:10:00Z',
  session: { stored: true, cookie_names: ['SID', 'HSID', 'SSID'], permissions_ok: true, encrypted: false, protection: '소유자 전용 파일 권한(0600/0700)만 사용합니다. 암호화하지 않습니다.' },
  metrics: { counters: { 'requests.read': 12, 'jobs.started': 2, duplicates_blocked: 1 }, latency: { 'list_notebooks': { count: 4, avg_ms: 820.5, max_ms: 1310.2 } }, scope: 'process' },
});
const LIST = [
  { id: 'nb1', title: 'AI 논문 리서치', source_count: 3, created_at: '2026-10-18T01:00:00Z', updated_at: '2026-10-19T01:00:00Z', is_owner: true },
  { id: 'nb2', title: '2026 트렌드 보고서 모음 — 아주 긴 제목이 들어가도 줄바꿈이 되는지 확인하는 노트북 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', source_count: 5, created_at: null, updated_at: '2026-10-17T05:00:00Z', is_owner: true },
  { id: 'nb3', title: '공유받은 노트북', source_count: 1, created_at: null, updated_at: null, is_owner: false },
];
const err = (status, code, message, extra = {}) => ({ status, json: { code, message, ...extra }, headers: extra.retry_after ? { 'retry-after': String(extra.retry_after) } : {} });
const futureCooldown = new Date(Date.now() + 8 * 60_000 + 20_000).toISOString();

const nowIso = () => new Date().toISOString();
const SCENARIOS = {
  'status-login-required': { path: '/notebooklm', status: authStatus() },
  'status-login-waiting': { path: '/notebooklm', status: authStatus({ login: { state: 'waiting', message: null, active: true, started_at: nowIso(), finished_at: null } }) },
  'status-session-saved': { path: '/notebooklm', status: authStatus({ state: 'session_saved', message: null, session: { stored: true, cookie_names: ['SID', 'HSID'], permissions_ok: true, encrypted: false, protection: '소유자 전용 파일 권한(0600/0700)만 사용합니다. 암호화하지 않습니다.' } }) },
  'status-cooldown': { path: '/notebooklm', status: authStatus({ state: 'cooldown', cooldown_until: futureCooldown, retry_after: 500, last_error_code: 'rate_limited', session: { ...READY.session } }) },
  'status-blocked': { path: '/notebooklm', status: authStatus({ state: 'blocked', last_error_code: 'protection_signal', session: { ...READY.session } }), act: (p) => p.getByRole('button', { name: /확인했어요, 재개/ }).click(), shotName: 'status-blocked-dialog' },
  'status-reauth': { path: '/notebooklm', status: authStatus({ state: 'reauth_required', session: { ...READY.session } }) },
  'status-disabled': { path: '/notebooklm', status: authStatus({ state: 'disabled' }) },
  'status-network-error': { path: '/notebooklm', statusError: true },
  'list-ready': { path: '/notebooklm', status: READY, list: LIST },
  'list-ready-metrics-open': { path: '/notebooklm', status: READY, list: LIST, act: (p) => p.getByText('사용 지표·제한').click() },
  'list-empty': { path: '/notebooklm', status: READY, list: [] },
  'list-loading': { path: '/notebooklm', status: READY, list: 'hang' },
  'list-cooldown-error': { path: '/notebooklm', status: READY, list: err(429, 'rate_limited', 'Google 사용 제한', { retry_after: 300 }) },
  'list-auth-error': { path: '/notebooklm', status: READY, list: err(409, 'auth_required', '로그인 필요') },
  'list-delete-confirm': { path: '/notebooklm', status: READY, list: LIST, act: (p) => p.getByRole('button', { name: 'AI 논문 리서치 삭제' }).click() },
  'detail-sources-jobs': {
    path: '/notebooklm/nb1', status: READY, list: LIST, detail: NOTEBOOK,
    jobs: [job(), job({ id: 'j2', kind: 'source_add_file', params: { file_name: 'report.pdf', sha256: 'x' }, status: 'succeeded', result: { ready: true }, finished_at: nowIso() }),
      job({ id: 'j3', kind: 'source_add_text', params: { title: '회의 메모', chars: 10 }, status: 'unknown', result: { outcome_unknown: true }, finished_at: nowIso() })],
  },
  'detail-empty': { path: '/notebooklm/nb1', status: READY, detail: { ...NOTEBOOK, sources: [], source_count: 0 } },
  'detail-query-answer': {
    path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], query: QUERY_RESULT,
    act: async (p) => {
      await p.getByRole('radio', { name: /질의/ }).check({ force: true }).catch(() => {});
      await p.getByLabel('질문').fill('이 논문의 핵심 주장은?');
      await p.getByRole('button', { name: /질문하기/ }).click();
      await p.getByTestId('answer').waitFor();
    },
  },
  'detail-citation-viewer': {
    path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], query: QUERY_RESULT,
    act: async (p) => {
      await p.getByRole('radio', { name: /질의/ }).check({ force: true }).catch(() => {});
      await p.getByLabel('질문').fill('이 논문의 핵심 주장은?');
      await p.getByRole('button', { name: /질문하기/ }).click();
      await p.getByTestId('answer').waitFor();
      await p.getByRole('button', { name: '인용 1번 보기' }).first().click();
      await p.getByRole('dialog').waitFor();
    },
  },
  'detail-citation-null': {
    path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], query: QUERY_RESULT,
    act: async (p) => {
      await p.getByRole('radio', { name: /질의/ }).check({ force: true }).catch(() => {});
      await p.getByLabel('질문').fill('영상은 뭐라고 해?');
      await p.getByRole('button', { name: /질문하기/ }).click();
      await p.getByTestId('answer').waitFor();
      await p.getByRole('button', { name: '인용 2번 보기' }).first().click();
      await p.getByRole('dialog').waitFor();
    },
  },
  'detail-query-error': {
    path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], query: err(504, 'timeout', '시간 초과', { outcome_unknown: true }),
    act: async (p) => {
      await p.getByRole('radio', { name: /질의/ }).check({ force: true }).catch(() => {});
      await p.getByLabel('질문').fill('이 논문의 핵심 주장은?');
      await p.getByRole('button', { name: /질문하기/ }).click();
      await p.getByRole('alert').waitFor();
    },
  },
  'detail-add-source': { path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], act: (p) => p.getByRole('button', { name: /소스 추가/ }).click() },
  'detail-add-duplicate-found': {
    path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], addUrl: { status: 200, json: { duplicate: true, job: null, source: { id: 's1', title: 'Attention Is All You Need', kind: 'url' } } },
    act: async (p) => { await p.getByRole('button', { name: /소스 추가/ }).click(); await p.getByLabel('웹페이지 주소').fill('https://example.com/a'); await p.getByRole('dialog').getByRole('button', { name: '추가' }).click(); await p.getByTestId('duplicate-found').waitFor(); },
  },
  'detail-add-duplicate-409': {
    path: '/notebooklm/nb1', status: READY, detail: NOTEBOOK, jobs: [], addUrl: err(409, 'duplicate', '이전 등록 요청의 결과를 알 수 없습니다. 노트북의 소스 목록을 확인하고, 없을 때만 force=true 로 다시 등록하세요.'),
    act: async (p) => {
      await p.getByRole('button', { name: /소스 추가/ }).click(); await p.getByLabel('웹페이지 주소').fill('https://example.com/a');
      await p.getByRole('dialog').getByRole('button', { name: '추가' }).click(); await p.getByTestId('duplicate-conflict').waitFor();
      await p.getByRole('button', { name: /소스 목록 확인/ }).click(); await p.getByTestId('recheck-list').waitFor();
    },
  },
  'detail-not-connected': { path: '/notebooklm/nb1', status: authStatus({ state: 'reauth_required' }) },
  'detail-network-error': { path: '/notebooklm/nb1', status: READY, detail: 'network' },
};

const profiles = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
];

await mkdir(out, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch();
let failures = 0;
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && !only.includes(name)) continue;
  for (const p of profiles) {
    const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.hasTouch, colorScheme: 'light' });
    await ctx.addInitScript('delete Navigator.prototype.serviceWorker');
    await ctx.addInitScript("try { localStorage.setItem('tk-onboarded', '1') } catch {}");
    await ctx.route((u) => u.pathname.startsWith('/api/'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const headers = { 'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const path = url.pathname.replace(/^\/api\//, '');
      const send = (v) => (v && v.status ? route.fulfill({ status: v.status, json: v.json, headers: { ...headers, ...(v.headers ?? {}) } }) : route.fulfill({ json: v, headers }));
      if (path === 'notebooklm/auth/status') return sc.statusError ? route.abort('failed') : send(sc.status);
      if (path === 'notebooklm/notebooks' && req.method() === 'GET') return sc.list === 'hang' ? new Promise(() => {}) : send(sc.list ?? LIST);
      if (path === 'notebooklm/notebooks/nb1' && req.method() === 'GET') return sc.detail === 'network' ? route.abort('failed') : send(sc.detail ?? NOTEBOOK);
      if (path === 'notebooklm/jobs') return send(sc.jobs ?? []);
      if (path === 'notebooklm/notebooks/nb1/query') return send(sc.query ?? QUERY_RESULT);
      if (path === 'notebooklm/notebooks/nb1/sources/url') return send(sc.addUrl ?? { duplicate: false, job: job(), source: null });
      return route.fulfill({ json: baseBody(path, req.method(), url.search), headers });
    });
    const page = await ctx.newPage();
    try {
      await page.goto(base + sc.path, { waitUntil: sc.list === 'hang' ? 'load' : 'networkidle' });
      await page.waitForTimeout(400);
      if (sc.act) { await sc.act(page); await page.waitForTimeout(400); }
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.tk-screen__body');
        return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: el ? el.scrollWidth - el.clientWidth : 0 };
      });
      if (overflow.doc > 0 || overflow.body > 0) { failures++; console.log(`OVERFLOW ${name} ${p.name}`, overflow); }
      const hasDialog = await page.locator('dialog[open]').count();
      await page.screenshot({ path: join(out, `${sc.shotName ?? name}-${p.name}.png`) });
      // 화면 본문(.tk-screen__body)은 안에서 스크롤되므로 긴 화면은 창을 키워 한 장으로 남긴다. 대화상자가 열려 있으면 건너뛴다.
      if (!hasDialog) {
        await page.setViewportSize({ width: p.viewport.width, height: 2400 });
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(out, `${sc.shotName ?? name}-${p.name}-full.png`) });
      }
      console.log(`ok ${name} ${p.name}`);
    } catch (e) {
      failures++;
      console.log(`FAIL ${name} ${p.name}: ${String(e).split('\n')[0]}`);
      await page.screenshot({ path: join(out, `FAIL-${name}-${p.name}.png`) }).catch(() => {});
    }
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
