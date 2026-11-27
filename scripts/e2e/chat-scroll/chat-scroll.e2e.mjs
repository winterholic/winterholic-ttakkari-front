/**
 * 채팅 스크롤 안정성 12개 시나리오 E2E (실제 입력·화면 위치 기준).
 * - 입력: Playwright 의 신뢰된 휠·키보드·클릭만 쓴다(scrollTop 직접 대입·dispatchEvent 없음). 터치 제스처는 Chromium 모바일에서만 CDP 로 보태고,
 *   WebKit(iPhone 에뮬레이션)은 제스처 API 가 없어 휠·키보드·탭만 쓴다. iPhone 실기기 제스처·실제 소프트 키보드는 이 스위트가 검증하지 못한다.
 * - 위치: 메시지 안정 ID(`author:run번호`)와 .tk-thread 컨테이너 기준 픽셀 위치를 적용 전후로 비교한다.
 * - 각 시나리오는 자기 원인 동작(요청·높이 변화·입력)이 실제로 일어났음을 먼저 단언한다. 원인이 없으면 PASS 하지 않는다.
 * 실행: PLAYWRIGHT_CORE=<경로>/playwright-core/index.mjs node scripts/e2e/chat-scroll/chat-scroll.e2e.mjs [--browser=chromium|webkit] [--scenarios=4,6] [--json=<파일>]
 * 교정 전 훅 변형: CHAT_SCROLL_HOOK_VARIANT=<useThreadFollow 대체 파일 절대 경로>
 */
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { startMockApi, DESK, TOTAL } from './mock-api.mjs';
import { createResources, e2ePorts, hookAlias, loadPlaywright } from './runtime.mjs';
import { PAGE_TOOLS, fmt, makeDriver, samePlace, trackRequests } from './scroll-lib.mjs';

const FIRST_LOADED = TOTAL - 40; // 처음 읽는 Run 은 최근 40개

/**
 * 준비(mock·Vite·브라우저 실행)가 어디서 실패해도 만든 서버를 모두 닫는다.
 * 옵션: playwright(테스트용 대체), vitePort, mockPort, scenarios(번호 배열). 환경: PLAYWRIGHT_CORE, CHAT_SCROLL_VITE_PORT, CHAT_SCROLL_MOCK_PORT.
 */
export async function runScenarios(options = {}) {
  const resources = createResources();
  try {
    return await runScenariosIn(options, resources);
  } finally {
    await resources.closeAll();
  }
}

async function runScenariosIn({ browserName = 'chromium', profile = 'desktop', playwright, vitePort, mockPort, scenarios } = {}, resources) {
  const { chromium, webkit, devices } = playwright ?? (await loadPlaywright());
  const ports = e2ePorts();
  const VITE_PORT = vitePort ?? ports.vitePort;
  const MOCK_PORT = mockPort ?? ports.mockPort;
  const browserType = browserName === 'webkit' ? webkit : chromium;
  const tag = `${browserName}-${profile}`;
  const APP = `http://127.0.0.1:${VITE_PORT}`;
  console.log(`\n=== [${tag}] chat-scroll E2E (hook variant: ${process.env.CHAT_SCROLL_HOOK_VARIANT ?? '현재 소스'}) ===`);

  const mock = resources.add(await startMockApi({ port: MOCK_PORT }), (m) => m.close());
  process.env.VITE_API_BASE = mock.url;
  process.env.TTAKKARI_NO_ENV_FILE = '1';
  const alias = hookAlias();
  const vite = resources.add(await createServer({
    server: { port: VITE_PORT, strictPort: true, host: '127.0.0.1' },
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(mock.url) },
    ...(alias ? { resolve: { alias } } : {}),
    configFile: './vite.config.ts',
    logLevel: 'error',
  }), (v) => v.close());
  await vite.listen();
  const browser = resources.add(await browserType.launch({ headless: true }), (b) => b.close());

  // desktop: 1280x800. iphone-viewport: iPhone 14 의 뷰포트·UA·배율이지만 isMobile=false 라 신뢰된 휠이 가능하다(Playwright 모바일 WebKit 은 mouse.wheel 미지원, 터치 스크롤 API 없음).
  // iphone-emulated: isMobile=true+터치. 휠을 못 쓰므로 호출하는 쪽이 휠이 필요 없는 시나리오만 고른다.
  const contextOptions = {
    desktop: { viewport: { width: 1280, height: 800 } },
    'iphone-viewport': { ...devices['iPhone 14'], isMobile: false, hasTouch: false },
    'iphone-emulated': { ...devices['iPhone 14'], hasTouch: true },
  }[profile];
  const viewport = contextOptions.viewport;
  const narrow = viewport.width < 1024; // 폰 폭: 트리 카드가 옆 서랍 대신 세션 화면으로 간다
  const ctl = (op) => fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify(op) });

  /** 시나리오마다 새 컨텍스트·새 mock 상태. ctlSet 은 페이지를 열기 전에 적용한다. */
  async function fresh({ ctlSet, live, url = `${APP}/chat/${DESK}`, open = true } = {}) {
    await ctl({ op: 'reset' });
    if (ctlSet) await ctl({ op: 'config', set: ctlSet });
    if (live) await ctl({ op: 'startLive', interval: live });
    const context = await browser.newContext(contextOptions);
    await context.addInitScript(PAGE_TOOLS);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    const log = trackRequests(page);
    const d = makeDriver(page, log, { vw: viewport.width, vh: viewport.height, canWheel: profile !== 'iphone-emulated' });
    if (open) await d.open(url, live ? 5 : 10, { live: !!live });
    return { page, d, log, errors, context, close: () => context.close() };
  }

  /** 검증 하나: 실패해도 계속 진행해 증거를 모은다. */
  const checks = () => {
    const failures = [];
    return {
      failures,
      ok(cond, msg) { if (!cond) failures.push(msg); return !!cond; },
    };
  };
  const num = (n) => Number(n.toFixed(1));
  const runNo = (id) => Number(/:(\d+)$/.exec(id)?.[1] ?? NaN);

  const S = [];
  const scenario = (n, name, fn) => S.push({ n, name, fn });

  // ---------------------------------------------------------------------------
  // 1. 긴 대화 탐색: 휠로 위로 8번 올라가며, 이전에 보던 메시지가 입력량만큼만 움직이고 지연 로딩 응답 뒤에도 제자리인지.
  scenario(1, '긴 대화 탐색', async (c) => {
    const f = await fresh();
    try {
      const { d, page, log } = f;
      const start = await d.info();
      c.ok(start.gap <= 4 && start.height > start.client * 8, `선행 조건: 긴 대화가 바닥에 있어야 함 (gap=${start.gap}, height=${start.height})`);
      const steps = [];
      let strict = 0;
      for (let k = 1; k <= 8; k++) {
        const r = await d.inputStep(() => d.wheel(-450));
        steps.push({ k, before: r.before.id, moved: r.moved && num(r.moved), eventsDuringInput: r.evDuring, mid: fmt(r.mid), after: fmt(r.after) });
        if (r.evDuring === 0 && r.prev) { strict++; c.ok(Math.abs(r.moved - 450) <= 3, `단계 ${k}: ${r.before.id} 가 450px 내려와야 함(실제 ${r.moved})`); }
        c.ok(samePlace(r.mid, r.after, 2), `단계 ${k}: 지연 로딩 응답 뒤 ${fmt(r.mid)} → ${fmt(r.after)} 이동`);
      }
      c.ok(strict >= 3, `입력 이동량을 엄격히 비교한 단계가 3개 이상이어야 함 (${strict})`);
      const end = await d.info();
      c.ok(end.gap > 3000, `끝: 바닥으로 튕기지 않아야 함 (gap=${end.gap})`);
      const requested = new Set(log.events);
      c.ok(requested.size > 0 && requested.size < 40, `지연 로딩: 근처 Run 만 events 요청(요청 ${requested.size}/40)`);
      let touch = 'not-run';
      if (profile === 'iphone-emulated' && browserName === 'chromium') {
        const cdp = await f.context.newCDPSession(page);
        const a0 = await d.anchor();
        const b = await d.thread().boundingBox();
        await cdp.send('Input.synthesizeScrollGesture', { x: b.x + b.width / 2, y: b.y + b.height / 2, yDistance: 300, gestureSourceType: 'touch', speed: 800 });
        await d.settle();
        const a1 = await d.pos(a0.id);
        touch = a1 ? num(a1.top - a0.top) : 'lost';
        c.ok(typeof touch === 'number' && touch > 200, `터치 제스처(CDP) 300px: ${a0.id} 이동 ${touch}`);
      }
      return { steps, strictSteps: strict, endGap: end.gap, eventsRequested: requested.size, touchGesture: touch };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 2. 스트리밍 중 96px 이내 위쪽 이탈: 60px 휠·키보드로 벗어나면 바닥 따라가기가 풀려 자라는 동안 제자리, 바닥으로 돌아오면 다시 따라간다.
  scenario(2, '스트리밍 중 96px 이내 위쪽 이탈', async (c) => {
    const phases = {};
    // 입력마다 새 페이지에서 시작한다(앞선 부드러운 스크롤이 다음 입력을 덮어쓰지 않게).
    for (const [name, kind, lo, hi] of [['휠 -60', 'wheel', 40, 110], ['키보드 ArrowUp×2', 'keys', 20, 110]]) {
      const f = await fresh({ live: 600 });
      try {
        const { d, page } = f;
        const h0 = (await d.info()).height;
        await d.until((h) => window.__tk.info().height >= h + 150, h0);
        const grew = await d.followSample();
        c.ok(grew.following, `${name}: 선행 조건 스트리밍이 자라는 동안 바닥을 따라감 (gap 표본 ${grew.gaps.join(',')}, 높이 ${h0}→${(await d.info()).height})`);
        if (kind === 'keys' && !(await d.focusThread())) { phases[name] = 'not-run: 이 엔진에서 스레드 안 컨트롤로 Tab 포커스 불가'; continue; }
        await page.evaluate(() => window.__tk.armDeparture());
        // 스트리밍 성장 직후에 입력한다: 성장 틱(600ms)과 입력이 같은 프레임에 겹치는 경합을 피해 입력 한 번의 효과만 본다.
        const hTick = (await d.info()).height;
        await d.until((h) => window.__tk.info().height > h, hTick, 3000);
        if (kind === 'wheel') await d.wheel(-60);
        else { await d.press('ArrowUp'); await d.press('ArrowUp'); }
        const dep = await page.evaluate(() => window.__tk.dep);
        const up = dep.peak - dep.min;
        c.ok(dep.departed && up >= lo && up <= hi, `${name}: 96px 이내로 위쪽 이탈이어야 함 (올라간 양 ${num(up)}px, peak ${num(dep.peak)}→min ${num(dep.min)})`);
        const after = await d.info();
        const a = await d.anchor();
        await page.evaluate((id) => window.__tk.startSampler(id), a.id);
        await d.until((h) => window.__tk.info().height >= h + 250, after.height, 15000);
        const st = await page.evaluate(() => window.__tk.stopSampler());
        const end = await d.painted();
        c.ok(st.maxTop - st.minTop <= 2, `${name}: 자라는 동안 ${a.id} 가 제자리여야 함 (흔들림 ${num(st.maxTop - st.minTop)}px)`);
        c.ok(end.top <= after.top + 2, `${name}: 바닥으로 끌려가지 않아야 함 (scrollTop ${num(after.top)}→${num(end.top)}, gap ${after.gap}→${end.gap})`);
        c.ok(end.gap > after.gap, `${name}: 자란 만큼 gap 이 늘어야 함 (${after.gap}→${end.gap})`);
        c.ok(await page.locator('button.tk-jump').isVisible(), `${name}: 새 메시지 버튼이 보여야 함`);
        phases[name] = { id: a.id, up: num(up), growth: end.height - after.height, jitter: num(st.maxTop - st.minTop), frames: st.frames, gapAfter: end.gap };
        if (kind === 'wheel') {
          // 바닥으로 돌아오면 다시 따라간다(부드러운 스크롤이 끝나길 조건으로 기다림).
          await d.wheel(99999);
          await d.until(() => window.__tk.info().gap <= 4, null);
          const h2 = (await d.info()).height;
          await d.until((h) => window.__tk.info().height >= h + 150, h2);
          const re = await d.followSample();
          c.ok(re.following, `${name}: 바닥 복귀 뒤 다시 따라가야 함 (gap 표본 ${re.gaps.join(',')})`);
          phases[name].refollow = re.gaps;
        }
      } finally { await f.close(); }
    }
    return phases;
  });

  // ---------------------------------------------------------------------------
  // 3. 갱신 중 작업 카드: 아래 메시지를 읽는 동안 위쪽 작업 카드가 폴링마다 자란다.
  scenario(3, '갱신 중 작업 카드', async (c) => {
    const f = await fresh({ ctlSet: { treeLive: true } });
    try {
      const { d, page, log } = f;
      const card = page.locator('section.tree-card[aria-label="맡긴 일: 맡긴 일 lead-live"]');
      // 카드는 Run 132 의 events 가 지연 로딩되어야 붙는다: 근처로 올라가며 기다린다.
      for (let i = 0; i < 20 && !(await card.count()); i++) await d.wheel(-300);
      await card.waitFor({ state: 'attached', timeout: 15000 });
      // 카드(Run 132) 바로 아래 메시지들(133~136)이 보이도록 올라간다.
      for (let i = 0; i < 80; i++) {
        const a = await d.anchor();
        if (a && runNo(a.id) >= 133 && runNo(a.id) <= 136) break;
        await d.wheel(a && runNo(a.id) < 133 ? 150 : -300);
      }
      await d.quiesce();
      const a0 = await d.anchor();
      c.ok(runNo(a0.id) >= 133 && runNo(a0.id) <= 136, `선행 조건: 카드 아래 메시지를 읽는 중 (anchor ${fmt(a0)})`);
      const cardH = () => card.evaluate((el) => el.getBoundingClientRect().height);
      const h0 = await cardH();
      const t0 = log.tree.filter((u) => u.startsWith('lead-live')).length;
      await page.evaluate((id) => window.__tk.startSampler(id), a0.id);
      // 카드가 두 번 더 자랄 때까지(폴링 4초 간격).
      await page.waitForFunction(([sel, h]) => document.querySelector(sel).getBoundingClientRect().height >= h + 2 * 20, ['section.tree-card[aria-label="맡긴 일: 맡긴 일 lead-live"]', h0], { timeout: 20000, polling: 'raf' });
      await d.quiesce();
      const st = await page.evaluate(() => window.__tk.stopSampler());
      const h1 = await cardH();
      const t1 = log.tree.filter((u) => u.startsWith('lead-live')).length;
      c.ok(h1 - h0 >= 40 && t1 - t0 >= 2, `원인 동작: 카드가 폴링으로 자라야 함 (높이 ${num(h0)}→${num(h1)}, 트리 요청 +${t1 - t0})`);
      c.ok(st.maxTop - st.minTop <= 2, `카드가 자라는 동안 ${a0.id} 가 제자리여야 함 (흔들림 ${num(st.maxTop - st.minTop)}px)`);
      return { anchor: a0.id, cardHeight: [num(h0), num(h1)], treeRequestsAdded: t1 - t0, jitter: num(st.maxTop - st.minTop), frames: st.frames };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 4. 지연 로딩 요청: 화면 근처로 들어온 위쪽 Run 의 events 응답이 높이를 바꿔도 읽던 메시지가 제자리여야 하고, 먼 Run 은 요청하지 않는다.
  scenario(4, '지연 로딩 요청', async (c) => {
    const f = await fresh({ ctlSet: { eventDelay: 700 } });
    try {
      const { d, page, log } = f;
      const initial = new Set(log.events);
      const farId = `run-${DESK}-${FIRST_LOADED}`;
      c.ok(initial.size > 0 && initial.size < 40 && !initial.has(farId), `선행 조건: 처음엔 바닥 근처만 요청, 먼 Run(${farId}) 은 요청하지 않음 (요청 ${initial.size}개)`);
      let proof = null;
      const trace = [];
      for (let step = 1; step <= 14 && !proof; step++) {
        const seen = log.events.length;
        await d.wheel(-500, { wait: false });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const fresh = log.events.slice(seen).filter((id) => !initial.has(id));
        trace.push({ step, newRequests: fresh.length });
        if (!fresh.length) { await d.settle(); continue; }
        // 응답(700ms) 전: 기준 메시지와 새로 근처에 온 Run 의 에이전트 메시지 높이를 잡는다.
        const runId = fresh[0];
        const n = Number(/-(\d+)$/.exec(runId)[1]);
        const before = await d.anchor();
        const target0 = await d.pos(`agent:${n}`);
        trace[trace.length - 1].detail = { runId, anchor: before && fmt(before), target: target0 && fmt(target0) };
        if (!before || !target0 || target0.top >= before.top) { await d.quiesce(); continue; } // 기준보다 위에서 로드되는 것만 의미가 있다
        const responded = () => log.responded.includes(runId);
        while (!responded()) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        await d.quiesce();
        const after = await d.pos(before.id);
        const target1 = await d.pos(`agent:${n}`);
        proof = { requestedRun: runId, anchor: before.id, before: num(before.top), after: after && num(after.top), targetHeight: [num(target0.height), num(target1.height)], step };
        c.ok(Math.abs(target1.height - target0.height) >= 30, `원인 동작: ${runId} 로딩 응답이 위쪽 높이를 바꿔야 함 (${num(target0.height)}→${num(target1.height)})`);
        c.ok(samePlace(before, after, 2), `응답 뒤 ${fmt(before)} → ${fmt(after)} 이동`);
      }
      c.ok(!!proof, '원인 동작: 위쪽 Run 의 지연 로딩 요청+응답을 일으키지 못함 → PASS 불가');
      const requested = new Set(log.events);
      c.ok(!requested.has(farId) || (await d.info()).top < 4000, `먼 Run(${farId}) 은 근처에 오기 전 요청하지 않음`);
      return { initialRequests: initial.size, totalRequests: requested.size, proof, trace };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 5. 이전 대화 더 보기: 위에 40개가 붙어도 같은 메시지가 같은 자리에 있고, 붙인 뒤 사용자가 옮긴 위치도 다음 높이 변화에서 유지된다.
  scenario(5, '이전 대화 더 보기', async (c) => {
    const f = await fresh({ ctlSet: { eventDelay: 500 } });
    try {
      const { d, page, log } = f;
      await d.wheel(-100000);
      await d.quiesce();
      const btn = page.locator('.thread-older button');
      await btn.waitFor({ state: 'visible', timeout: 8000 });
      const top = await d.info();
      c.ok(top.top <= 2, `선행 조건: 맨 위 (scrollTop=${top.top})`);
      const a0 = await d.anchor();
      const msgs0 = await page.locator('.tk-thread .tk-message').count();
      const runsReq0 = log.runs.length;
      await btn.click();
      await page.waitForFunction((n) => document.querySelectorAll('.tk-thread .tk-message').length > n, msgs0, { timeout: 8000 });
      await d.settle();
      const msgs1 = await page.locator('.tk-thread .tk-message').count();
      const a1 = await d.pos(a0.id);
      c.ok(log.runs.length > runsReq0 && log.runs.slice(runsReq0).some((u) => /limit=80/.test(u)), `원인 동작: limit=80 요청 (${log.runs.slice(runsReq0).join(', ')})`);
      c.ok(msgs1 > msgs0, `원인 동작: 메시지 ${msgs0}→${msgs1}`);
      c.ok(samePlace(a0, a1, 2), `붙인 직후 ${fmt(a0)} → ${fmt(a1)}`);
      await d.quiesce();
      const a2 = await d.pos(a0.id);
      c.ok(samePlace(a0, a2, 2), `붙인 뒤 지연 로딩이 끝나도 ${fmt(a0)} → ${fmt(a2)}`);
      // 붙인 뒤 사용자가 위쪽(새로 붙은 쪽)으로 옮기면 그 위치가 다음 높이 변화(지연 로딩)에서 유지돼야 한다.
      const phases = [];
      for (const dy of [-2500, 900, -2500, -2500]) {
        const hBefore = (await d.info()).height;
        const reqBefore = log.events.length;
        await d.wheel(dy);
        const b = await d.anchor();
        const hMid = (await d.info()).height;
        await d.quiesce();
        const b2 = await d.pos(b.id);
        const hAfter = (await d.info()).height;
        const newReq = log.events.length - reqBefore;
        phases.push({ dy, anchor: b.id, mid: num(b.top), after: b2 && num(b2.top), newEventRequests: newReq, heightChangeAfterInput: hAfter - hMid });
        c.ok(samePlace(b, b2, 2), `사용자 이동 ${dy}px 뒤 높이 변화에서 ${fmt(b)} → ${fmt(b2)} (옛 기준점으로 튕김?)`);
        void hBefore;
      }
      c.ok(phases.some((p) => p.newEventRequests > 0 && Math.abs(p.heightChangeAfterInput) >= 30), '원인 동작: 이동 뒤 지연 로딩으로 높이가 실제로 바뀐 단계가 있어야 함');
      return { before: a0.id, tops: [num(a0.top), a1 && num(a1.top), a2 && num(a2.top)], messages: [msgs0, msgs1], phases };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 6. 동시 비동기 높이 변화: 스트리밍·작업 카드 폴링·지연 로딩이 한꺼번에 일어나는 동안 읽는 메시지의 흔들림.
  scenario(6, '동시 비동기 높이 변화', async (c) => {
    // events 응답을 2.5초 늦춰, 응답·카드 폴링(4초)·스트리밍 성장이 한 창 안에서 겹치게 한다.
    const f = await fresh({ ctlSet: { treeLive: true, eventDelay: 2500 }, live: 500 });
    try {
      const { d, page, log } = f;
      const cardSel = 'section.tree-card[aria-label="맡긴 일: 맡긴 일 lead-live"]';
      // 카드(Run 132) 아래 과거 메시지(133~136)를 읽는 자리까지 올라간다. 카드는 events 가 와야 붙는다.
      for (let i = 0; i < 30; i++) {
        const a = await d.anchor();
        if (a && !/live/.test(a.id) && runNo(a.id) <= 136 && (await page.locator(cardSel).count())) break;
        await d.wheel(-300);
        await d.quiesce({ scroll: false });
      }
      // 아직 요청하지 않은 위쪽 Run 이 근처에 들어오는 순간(요청 발생)까지 조금씩 올라간다.
      const seen = log.events.length;
      for (let i = 0; i < 20 && log.events.length === seen; i++) {
        await d.wheel(-200);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
      c.ok(log.events.length > seen, '선행 조건: 새 지연 로딩 요청이 발생해야 함');
      const a0 = await d.anchor();
      c.ok(!/live/.test(a0.id), `선행 조건: 스트리밍 위의 과거 메시지를 읽는 중 (${fmt(a0)})`);
      const base = { tree: log.tree.length, responded: log.responded.length, height: (await d.info()).height };
      const need = () => ({ tree: log.tree.length - base.tree, responded: log.responded.length - base.responded });
      await page.evaluate((id) => window.__tk.startSampler(id), a0.id);
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        const grown = (await d.info()).height >= base.height + 300;
        if (need().tree >= 1 && need().responded >= 1 && grown && Date.now() - t0 >= 3000) break;
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      }
      const st = await page.evaluate(() => window.__tk.stopSampler());
      const n = need();
      c.ok(n.tree >= 1 && n.responded >= 1, `원인 동작: 카드 폴링≥1, events 응답≥1 이 한 창 안에서 겹쳐야 함 (트리 +${n.tree}, 응답 +${n.responded})`);
      c.ok(st.heightMax - st.heightMin >= 300, `원인 동작: 전체 높이가 실제로 변해야 함 (${st.heightMin}→${st.heightMax})`);
      c.ok(st.frames >= 15 && st.lost === 0, `표본 ${st.frames}프레임, 기준 메시지 소실 ${st.lost}`);
      c.ok(st.maxTop - st.minTop <= 3, `동시 변화 중 ${a0.id} 흔들림 ${num(st.maxTop - st.minTop)}px (≤3)`);
      return { anchor: a0.id, added: n, height: [st.heightMin, st.heightMax], jitter: num(st.maxTop - st.minTop), frames: st.frames, windowMs: Date.now() - t0 };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 7. 빠른 방향 전환: 기다림 없이 위·아래·위로 휠과 키보드를 연달아 넣는다.
  scenario(7, '빠른 방향 전환', async (c) => {
    const f = await fresh();
    try {
      const { d } = f;
      await d.wheel(-600); await d.quiesce(); // 근처 Run 의 events 를 먼저 받아 높이를 고정
      const a0 = await d.anchor();
      const s0 = (await d.info()).top;
      await d.wheel(-400, { wait: false });
      await d.wheel(200, { wait: false });
      await d.wheel(-600, { wait: false });
      await d.settle();
      const wheelEnd = await d.pos(a0.id);
      const expectedWheel = 400 - 200 + 600; // a0 가 화면에서 내려온 양
      await d.quiesce();
      const wheelAfter = await d.pos(a0.id);
      const s1 = (await d.info()).top;
      c.ok(!wheelEnd || Math.abs((wheelEnd.top - a0.top) - expectedWheel) <= 4 || wheelEnd.top > f.d.vh, `휠 -400/+200/-600 순수 이동 ${wheelEnd ? num(wheelEnd.top - a0.top) : '화면 밖'} (기대 ${expectedWheel}, scrollTop ${num(s0)}→${num(s1)})`);
      c.ok(!wheelEnd || samePlace(wheelEnd, wheelAfter, 2), `휠 뒤 로딩 응답으로 ${fmt(wheelEnd)} → ${fmt(wheelAfter)} 이동`);
      // 키보드 연타: 위·아래·위. 입력 사이 대기 없음. 스레드에 포커스를 못 두는 엔진이면 미실행으로 남긴다.
      let keyboard = 'not-run: 이 엔진에서 스레드 안 컨트롤로 Tab 포커스 불가';
      if (await d.focusThread()) {
        const k0 = await d.anchor();
        const sk0 = (await d.info()).top;
        for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowUp']) await d.press(key, { wait: false });
        await d.settle();
        const kMid = await d.pos(k0.id);
        await d.quiesce();
        const kAfter = await d.pos(k0.id);
        const sk1 = (await d.info()).top;
        c.ok(sk1 < sk0, `키보드 ↑↑↓↑ 순이동은 위쪽이어야 함 (scrollTop ${num(sk0)}→${num(sk1)})`);
        c.ok(samePlace(kMid, kAfter, 2), `키보드 뒤 로딩 응답으로 ${fmt(kMid)} → ${fmt(kAfter)} 이동`);
        keyboard = { id: k0.id, scrollTop: [num(sk0), num(sk1)], afterLoad: kAfter && num(kAfter.top) };
      }
      const end = await d.info();
      c.ok(end.gap > 200, `바닥으로 튕기지 않아야 함 (gap=${end.gap})`);
      return { wheel: { id: a0.id, expectedShift: expectedWheel, shift: wheelEnd && num(wheelEnd.top - a0.top), afterLoad: wheelAfter && num(wheelAfter.top) }, keyboard, endGap: end.gap };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 8. 하단 복귀: 새 메시지 버튼(클릭)과 End 키로 바닥에 돌아오면 다시 스트리밍을 따라간다.
  scenario(8, '하단 복귀', async (c) => {
    const f = await fresh({ live: 250 });
    try {
      const { d, page } = f;
      await d.until(() => document.querySelector('.tk-message[aria-busy="true"]'), null);
      const out = {};
      for (const how of ['버튼 클릭', 'End 키']) {
        await d.wheel(-1500);
        await d.quiesce();
        const away = await d.info();
        c.ok(away.gap > 500, `${how}: 선행 조건 위로 올라가 있어야 함 (gap=${away.gap})`);
        const jump = page.locator('button.tk-jump');
        if (how === '버튼 클릭') {
          await jump.waitFor({ state: 'visible', timeout: 5000 });
          await jump.click();
        } else {
          if (!(await d.focusThread())) { out[how] = 'not-run: 이 엔진에서 스레드 안 컨트롤로 Tab 포커스 불가'; continue; }
          await page.keyboard.press('End');
        }
        await page.waitForFunction(() => window.__tk.info().gap <= 4, null, { timeout: 8000, polling: 'raf' });
        const back = await d.followSample(5);
        c.ok(back.following, `${how}: 바닥 복귀 (gap 표본 ${back.gaps.join(',')})`);
        await page.waitForFunction(() => !document.querySelector('button.tk-jump'), null, { timeout: 3000 });
        const h = (await d.info()).height;
        await page.waitForFunction((x) => window.__tk.info().height >= x + 150, h, { timeout: 15000, polling: 'raf' });
        const follow = await d.followSample();
        const fh = (await d.info()).height;
        c.ok(follow.following, `${how}: 복귀 뒤 자라는 스트리밍을 따라가야 함 (높이 ${h}→${fh}, gap 표본 ${follow.gaps.join(',')})`);
        out[how] = { awayGap: away.gap, backGaps: back.gaps, followGaps: follow.gaps, growth: fh - h };
      }
      return out;
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 9. 입력창 포커스·뷰포트 축소/복원: 키보드가 올라온 것을 뷰포트 높이 축소로 에뮬레이션한다(실제 소프트 키보드는 검증하지 못함).
  scenario(9, '입력창 포커스·뷰포트 축소/복원', async (c) => {
    const f = await fresh();
    try {
      const { d, page } = f;
      const full = { width: viewport.width, height: viewport.height };
      const small = { width: viewport.width, height: Math.round(viewport.height * 0.6) };
      const textarea = page.locator('textarea').first();
      const out = {};
      // (a) 바닥에서 입력창을 눌러 포커스하고 뷰포트를 줄였다 되돌린다.
      await textarea.click();
      c.ok(await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'), '선행 조건: 입력창에 포커스');
      const base = await d.info();
      await page.setViewportSize(small);
      await d.quiesce();
      const shrunk = await d.info();
      c.ok(shrunk.client < base.client, `원인 동작: 대화 영역이 줄어야 함 (${base.client}→${shrunk.client})`);
      const lastShrunk = (await page.evaluate(() => window.__tk.messages().at(-1)));
      c.ok(shrunk.gap <= 4, `(a) 축소: 바닥을 보던 사용자는 마지막 메시지가 계속 보여야 함 (gap=${shrunk.gap}, 마지막 메시지 bottom=${num(lastShrunk.bottom)}/${shrunk.client})`);
      await page.setViewportSize(full);
      await d.quiesce();
      const restored = await d.info();
      c.ok(restored.gap <= 4, `(a) 복원: 다시 바닥이어야 함 (gap=${restored.gap})`);
      out.atBottom = { gap: [base.gap, shrunk.gap, restored.gap], client: [base.client, shrunk.client, restored.client] };
      // (b) 중간을 읽다가 같은 일을 겪는다. 휠이 안 되는 프로파일은 키보드(PageUp)로 올라간다(driver.wheelFallback).
      try {
        await d.wheel(-1500);
      } catch (e) {
        if (!e.noScrollInput) throw e;
        out.reading = `not-run: ${e.message}`; // 모바일 WebKit 에뮬레이션: 휠·키보드 포커스 모두 불가(터치 스크롤 API 없음)
        return out;
      }
      await d.quiesce();
      const a0 = await d.anchor();
      await page.setViewportSize(small);
      await d.quiesce();
      const a1 = await d.pos(a0.id);
      c.ok(samePlace(a0, a1, 2), `(b) 축소: 읽던 ${fmt(a0)} → ${fmt(a1)}`);
      await page.setViewportSize(full);
      await d.quiesce();
      const a2 = await d.pos(a0.id);
      c.ok(samePlace(a0, a2, 2), `(b) 복원: 읽던 ${fmt(a0)} → ${fmt(a2)}`);
      out.reading = { id: a0.id, tops: [num(a0.top), a1 && num(a1.top), a2 && num(a2.top)] };
      if (d.wheelFallback) out.input = d.wheelFallback;
      return out;
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 10. 앱 내 작업 트리 전환: 새로고침 없이(마커 유지) 트리 카드 → 작업 세션 → 뒤로.
  scenario(10, '앱 내 작업 트리 전환', async (c) => {
    const f = await fresh();
    try {
      const { d, page } = f;
      const marker = await page.evaluate(() => window.__e2eMarker);
      const card = page.locator('section.tree-card[aria-label="맡긴 일: 맡긴 일 lead-137"]');
      // 카드는 Run 137 의 events 가 지연 로딩되어야 붙는다(폰 폭에서는 Run 이 길어 한참 올라가야 한다).
      for (let i = 0; i < 60 && !(await card.count()); i++) { await d.wheel(-300); await d.quiesce(); }
      await card.waitFor({ state: 'attached', timeout: 15000 });
      await card.scrollIntoViewIfNeeded();
      await d.settle();
      await card.locator('button.tree-card__title').click();
      const out = { desktopDrawer: null };
      if (!narrow) {
        await page.locator('aside.desk-split__node').waitFor({ state: 'visible', timeout: 8000 });
        await d.quiesce();
        out.desktopDrawer = { url: new URL(page.url()).search, gap: (await d.info()).gap };
        await page.locator('a[aria-label="이 세션을 크게 보기"]').click();
      }
      await page.waitForFunction(() => /\/chat\/lead-137$/.test(location.pathname), null, { timeout: 8000 });
      await page.waitForFunction(() => document.querySelectorAll('.tk-thread .tk-message').length >= 2, null, { timeout: 8000 });
      await d.quiesce();
      const w = await d.info();
      const title = await page.locator('h1').first().textContent();
      const ids = await page.evaluate(() => window.__tk.messages().slice(0, 2).map((m) => m.id));
      c.ok(marker === (await page.evaluate(() => window.__e2eMarker)), '앱 안 이동이어야 함(새로고침 없음)');
      c.ok(w.gap <= 4, `작업 세션은 바닥에서 시작해야 함 (gap=${w.gap})`);
      c.ok(/작업 세션/.test(title ?? ''), `작업 세션이 열려야 함 (제목 "${title}")`);
      await d.wheel(-300);
      const wa = await d.anchor();
      await d.quiesce();
      const wb = await d.pos(wa.id);
      c.ok(samePlace(wa, wb, 2), `작업 세션에서 사용자가 올린 위치 유지 ${fmt(wa)} → ${fmt(wb)}`);
      out.worker = { url: new URL(page.url()).pathname, title, firstIds: ids, gap: w.gap, moved: [fmt(wa), fmt(wb)] };
      // 뒤로: 접수 대화로 돌아와 바닥에서 시작(드로어가 열렸다면 한 번 더).
      await page.goBack();
      if (!narrow) await page.goBack();
      await page.waitForFunction((id) => location.pathname === `/chat/${id}`, DESK, { timeout: 8000 });
      await page.waitForFunction(() => document.querySelectorAll('.tk-thread .tk-message').length >= 10, null, { timeout: 8000 });
      await d.quiesce();
      const back = await d.info();
      c.ok(marker === (await page.evaluate(() => window.__e2eMarker)), '뒤로 가기도 앱 안 이동이어야 함');
      c.ok(back.gap <= 4, `접수 대화로 돌아오면 바닥 (gap=${back.gap})`);
      out.back = { url: new URL(page.url()).pathname, gap: back.gap };
      return out;
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 11. 반복 탐색: 휠 ±350 여섯 번 + 페이지·화살표 키. 단계마다 이동량과 로딩 뒤 제자리를 확인한다.
  scenario(11, '반복 탐색', async (c) => {
    const f = await fresh();
    try {
      const { d } = f;
      await d.wheel(-800); await d.quiesce();
      const steps = [];
      let bounced = false;
      let strict = 0;
      for (let k = 1; k <= 6; k++) {
        const dy = k % 2 ? -350 : 350;
        const r = await d.inputStep(() => d.wheel(dy));
        if (r.info.gap <= 5) bounced = true;
        steps.push({ k, dy, before: r.before.id, moved: r.moved && num(r.moved), eventsDuringInput: r.evDuring, mid: fmt(r.mid), after: fmt(r.after), gap: r.info.gap });
        if (r.evDuring === 0 && r.prev) { strict++; c.ok(Math.abs(r.moved + dy) <= 3, `단계 ${k}: ${r.before.id} 이동 ${num(r.moved)} (기대 ${-dy})`); }
        c.ok(samePlace(r.mid, r.after, 2), `단계 ${k}: 로딩 뒤 ${fmt(r.mid)} → ${fmt(r.after)}`);
      }
      c.ok(strict >= 2, `입력 이동량을 엄격히 비교한 단계가 2개 이상이어야 함 (${strict})`);
      const keys = [];
      const keyboard = await d.focusThread();
      for (const key of keyboard ? ['PageUp', 'PageUp', 'ArrowUp', 'PageDown', 'ArrowDown'] : []) {
        const r = await d.inputStep(() => d.press(key));
        if (r.info.gap <= 5) bounced = true;
        keys.push({ key, before: r.before.id, eventsDuringInput: r.evDuring, mid: fmt(r.mid), after: fmt(r.after), gap: r.info.gap });
        c.ok(samePlace(r.mid, r.after, 2), `키 ${key}: 로딩 뒤 ${fmt(r.mid)} → ${fmt(r.after)}`);
      }
      c.ok(!bounced, '반복 중 한 번도 바닥(gap≤5)으로 튕기지 않아야 함');
      return { steps, strictSteps: strict, keys: keyboard ? keys : 'not-run: 이 엔진에서 스레드 안 컨트롤로 Tab 포커스 불가' };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  // 12. 기본 채팅 회귀: 앞 시나리오 결과를 합치지 않고, 새로 열어 기본 동작만 독립적으로 본다.
  scenario(12, '기본 채팅 회귀', async (c) => {
    const f = await fresh({ live: 250 });
    try {
      const { d, page, errors } = f;
      const first = await d.followSample();
      c.ok(first.following, `열면 바닥 (gap 표본 ${first.gaps.join(',')})`);
      c.ok(!(await page.locator('button.tk-jump').isVisible()), '바닥에서는 새 메시지 버튼이 없어야 함');
      await d.until(() => document.querySelector('.tk-message[aria-busy="true"]'), null);
      const h0 = (await d.info()).height;
      const gaps = [];
      for (const growth of [100, 250, 400]) {
        await page.waitForFunction(([h, g]) => window.__tk.info().height >= h + g, [h0, growth], { timeout: 15000, polling: 'raf' });
        gaps.push((await d.followSample(5)).following);
      }
      c.ok(gaps.every(Boolean), `스트리밍이 자라는 동안 바닥을 유지 (구간별 따라가는 중: ${gaps.join(',')})`);
      await ctl({ op: 'stopLive' });
      await page.waitForFunction(() => !document.querySelector('.tk-message[aria-busy="true"]'), null, { timeout: 20000, polling: 'raf' });
      await d.quiesce();
      const fin = await d.info();
      c.ok(fin.gap <= 4, `스트리밍이 끝난 뒤에도 바닥 (gap=${fin.gap})`);
      c.ok(await page.locator('textarea').first().isVisible(), '입력창이 보여야 함');
      c.ok(errors.length === 0, `페이지 오류 없음 (${errors.join(' | ')})`);
      return { initialGaps: first.gaps, streamingFollowing: gaps, finalGap: fin.gap, pageErrors: errors.length };
    } finally { await f.close(); }
  });

  // ---------------------------------------------------------------------------
  const selected = scenarios?.length ? S.filter((s) => scenarios.includes(s.n)) : S;
  const results = [];
  for (const s of selected) {
    const c = checks();
    let evidence = null;
    let error = null;
    const t0 = Date.now();
    try {
      evidence = await s.fn(c);
    } catch (e) {
      error = e;
      c.failures.push(`실행 오류: ${e.message.split('\n')[0]}`);
    }
    const ok = c.failures.length === 0;
    results.push({ browser: tag, num: s.n, name: s.name, ok, ms: Date.now() - t0, failures: c.failures, evidence, error: error ? String(error.stack ?? error).split('\n').slice(0, 3).join(' / ') : null });
    console.log(`[${tag}] S${s.n} ${s.name} -> ${ok ? 'PASS' : 'FAIL'} (${Date.now() - t0}ms)`);
    console.log(`    evidence: ${JSON.stringify(evidence)}`);
    for (const f of c.failures) console.log(`    ✗ ${f}`);
  }
  return results;
}

// 직접 실행: Chromium 데스크톱 → 모바일 WebKit(iPhone 14) 순차(1 워커). 한쪽이 준비에 실패해도 단계·오류를 남기고 다른 쪽을 계속한다.
if (process.argv[1].endsWith('chat-scroll.e2e.mjs')) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const only = arg('browser');
  const scenarios = arg('scenarios')?.split(',').map(Number);
  const jsonPath = arg('json');
  // 순차 1 워커. WebKit 모바일 에뮬레이션은 휠·터치 스크롤·Tab 포커스가 없어 스크롤 입력이 필요 없는 9(바닥 부분)·12 만 돈다(10 은 iphone-viewport 에서 같은 폭으로 검증).
  const plan = [
    { browserName: 'chromium', profile: 'desktop' },
    { browserName: 'webkit', profile: 'iphone-viewport' },
    { browserName: 'webkit', profile: 'iphone-emulated', scenarios: [9, 12] },
    ...(process.argv.includes('--chromium-mobile') ? [{ browserName: 'chromium', profile: 'iphone-emulated', scenarios: [1, 9, 12] }] : []),
  ].filter((p) => !only || p.browserName === only);
  const all = [];
  const missing = [];
  console.log('Running sequentially with workers=1...');
  for (const p of plan) {
    try {
      all.push(...(await runScenarios({ ...p, scenarios: scenarios ?? p.scenarios })));
    } catch (err) {
      missing.push({ browser: `${p.browserName}-${p.profile}`, stage: 'prepare/run', error: String(err.message ?? err).split('\n')[0] });
      console.error(`[${p.browserName}] 실행 불가(다른 환경은 계속): ${err.message}`);
    }
  }
  const failed = all.filter((r) => !r.ok);
  console.log('\n===== SUMMARY =====');
  for (const r of all) console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.browser}] S${r.num} ${r.name}`);
  for (const m of missing) console.log(`MISSING [${m.browser}] ${m.stage}: ${m.error}`);
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ hookVariant: process.env.CHAT_SCROLL_HOOK_VARIANT ?? null, results: all, missing }, null, 1));
  process.exit(failed.length || missing.length ? 1 : 0);
}
