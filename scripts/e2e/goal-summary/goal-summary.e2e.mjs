/**
 * GoalSummaryBar 실제 화면 점검. 기획(orchestrator) 세션 화면에 상태별 goal_summary 를 주고
 * 좁은 폭(320·360·390)에서 표시줄이 가로로 넘치지 않는지, 상태 표지가 기대와 같은지 본다.
 * mock 백엔드(chat-scroll 의 mock-api)를 쓰고 session 응답만 page.route 로 바꾼다. 운영 백엔드에는 닿지 않는다.
 * 실행: PLAYWRIGHT_CORE=<경로>/playwright-core/index.mjs node scripts/e2e/goal-summary/goal-summary.e2e.mjs [--shots=<디렉터리>]
 */
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { startMockApi } from '../chat-scroll/mock-api.mjs';
import { createResources, loadPlaywright } from '../chat-scroll/runtime.mjs';
import { PAGE_TOOLS } from '../chat-scroll/scroll-lib.mjs';

const SID = 'lead-3';
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
const WIDTHS = [320, 360, 390];
const LONG = '아주 긴 의존성 이름이 한 줄에 다 들어가지 않을 만큼 길게 이어지는 경우 ' + 'x'.repeat(60);

const base = {
  status: 'active', phase: 'running', goal: '백엔드 안정화 작업을 끝까지 마친다. 긴 목표 문장이 좁은 화면에서도 줄바꿈되어야 한다', revision: 3,
  completed: [{ id: 'A', text: '스키마 작성', status: 'done', evidence: 'pytest -q: 3 passed' }],
  pending: [{ id: 'B', text: 'API 구현 ' + 'y'.repeat(80), status: 'pending', evidence: '' }],
  completed_count: 1, pending_count: 1, running_tasks: ['API 작업자', '문서 작업자'], next_action: 'B 구현',
  waiting_until: null, stop_reason: '', blocker_kind: null, auto_resumable: true, user_action: 'none', user_intervention_needed: false,
  additional_request_count: 0, updated_at: '2026-11-28T00:00:00Z',
  wait_type: null, waiting_dependencies: [], has_partial_failure: false, has_owner: true,
};
const until = new Date(Date.now() + 3 * 3600_000).toISOString();
const CASES = [
  ['running', 'running', { }],
  ['external', 'external', { phase: 'waiting', wait_type: 'external_dependency', waiting_dependencies: [{ target: LONG }, { target: '배포 완료' }, { target: 'CI' }, { target: '리뷰' }], running_tasks: [] }],
  ['usage', 'usage', { phase: 'waiting', wait_type: 'usage_limit', waiting_until: until, running_tasks: [] }],
  ['auto', 'auto', { phase: 'waiting', wait_type: null, waiting_until: until, running_tasks: [] }],
  ['partial', 'partial', { has_partial_failure: true, pending: [{ id: 'B', text: 'API', status: 'blocked', evidence: '' }] }],
  ['paused', 'paused', { status: 'paused', phase: 'paused', auto_resumable: false, user_action: 'resume', has_owner: false, running_tasks: [], stop_reason: '사용자가 중단했습니다. ' + LONG }],
  ['review', 'review', { user_action: 'review', user_intervention_needed: true }],
  ['complete', 'complete', { status: 'complete', phase: 'complete', pending: [], pending_count: 0, running_tasks: [], next_action: '', auto_resumable: false, has_owner: false }],
  ['no_owner', 'no_owner', { has_owner: false, running_tasks: [] }],
  ['blocked', 'blocked', { status: 'blocked', phase: 'blocked', auto_resumable: false, user_action: 'intervene', user_intervention_needed: true, blocker_kind: 'no_progress', stop_reason: '같은 오류 반복 ' + LONG, has_owner: false, running_tasks: [] }],
  ['legacy(필드 없음)', 'running', { __legacy: true }],
  ['legacy waiting', 'waiting', { __legacy: true, phase: 'waiting', waiting_until: until }],
  ['대기+일부 장애(긴 문장)', 'usage', { phase: 'waiting', wait_type: 'usage_limit', waiting_until: until, has_partial_failure: true, pending: [{ id: 'B', text: 'API', status: 'blocked', evidence: '' }], next_action: LONG }],
];
const LEGACY_DROP = ['wait_type', 'waiting_dependencies', 'has_partial_failure', 'has_owner'];

const resources = createResources();
const failures = [];
try {
  const { chromium } = await loadPlaywright();
  const mock = resources.add(await startMockApi({ port: 0 }), (m) => m.close());
  process.env.VITE_API_BASE = mock.url;
  process.env.TTAKKARI_NO_ENV_FILE = '1';
  const vite = resources.add(await createServer({
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(mock.url) },
    configFile: './vite.config.ts', logLevel: 'error',
  }), (v) => v.close());
  await vite.listen();
  const app = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = resources.add(await chromium.launch({ headless: true }), (b) => b.close());
  if (shots) mkdirSync(shots, { recursive: true });

  for (const width of WIDTHS) {
    for (const [name, kind, patch] of CASES) {
      const { __legacy, ...rest } = patch;
      const summary = { ...base, ...rest };
      if (__legacy) for (const k of LEGACY_DROP) delete summary[k];
      const ctx = await browser.newContext({ viewport: { width, height: 700 } });
      await ctx.addInitScript(PAGE_TOOLS);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
      await page.route(new RegExp(`/api/sessions/${SID}$`), (route) => route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': route.request().headers().origin ?? app, 'access-control-allow-credentials': 'true' },
        body: JSON.stringify({ id: SID, workspace_id: 'ws1', title: '기획 세션', engine: 'claude', model: null, effort: null, engine_session_id: null,
          kind: 'orchestrator', parent_id: null, pool: 'personal', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null,
          active_run_id: null, last_run_status: 'succeeded', goal_summary: summary }),
      }));
      await page.goto(`${app}/chat/${SID}`);
      const bar = page.locator('.goal-summary');
      try { await bar.waitFor({ timeout: 8000 }); } catch { failures.push(`[${width}] ${name}: 표시줄이 그려지지 않음`); await ctx.close(); continue; }
      const measure = () => page.evaluate(() => {
        const bar = document.querySelector('.goal-summary');
        const r = bar.getBoundingClientRect();
        const out = [];
        for (const el of bar.querySelectorAll('*')) {
          const b = el.getBoundingClientRect();
          if (b.width && (b.right > r.right + 1 || b.left < r.left - 1)) out.push(`${el.className || el.tagName}:${Math.round(b.right)}>${Math.round(r.right)}`);
        }
        return { kind: bar.dataset.kind, badge: bar.querySelector('.tk-badge')?.textContent, barW: Math.round(r.width), vw: innerWidth,
          docOverflow: document.documentElement.scrollWidth - innerWidth, barOverflow: bar.scrollWidth - bar.clientWidth, h: Math.round(r.height), out: out.slice(0, 4) };
      });
      const check = (tag, m) => {
        if (m.kind !== kind) failures.push(`[${width}] ${name}${tag}: 상태 ${m.kind} (기대 ${kind})`);
        if (m.docOverflow > 0 || m.barOverflow > 0 || m.out.length) failures.push(`[${width}] ${name}${tag}: 가로 넘침 doc=${m.docOverflow} bar=${m.barOverflow} ${m.out.join(',')}`);
      };
      const closed = await measure();
      check('', closed);
      if (shots) await page.screenshot({ path: `${shots}/${width}-${name.replace(/[^\w가-힣]+/g, '_')}-closed.png` });
      await bar.locator('.goal-summary__head').click();
      await page.locator('.goal-summary__body').waitFor();
      const open = await measure();
      check(' 펼침', open);
      if (shots) await page.screenshot({ path: `${shots}/${width}-${name.replace(/[^\w가-힣]+/g, '_')}-open.png` });
      if (errors.length) failures.push(`[${width}] ${name}: pageerror ${errors[0]}`);
      console.log(`[${width}] ${name.padEnd(18)} badge=${closed.badge} kind=${closed.kind} h=${closed.h}→${open.h} overflow(doc/bar)=${closed.docOverflow}/${closed.barOverflow}, ${open.docOverflow}/${open.barOverflow}`);
      await ctx.close();
    }
  }
} finally {
  await resources.closeAll();
}
console.log(failures.length ? `\nFAIL ${failures.length}건\n${failures.join('\n')}` : '\nPASS 모든 폭·상태에서 넘침 없음');
process.exit(failures.length ? 1 : 0);
