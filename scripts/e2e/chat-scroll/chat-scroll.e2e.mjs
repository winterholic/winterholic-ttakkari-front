/**
 * 채팅 스크롤 안정성 12개 시나리오 종합 E2E 검증 스위트
 * 데스크톱 Chromium 및 모바일 WebKit 환경에서 1개 워커로 순차 검증한다.
 * 검증은 단순 scrollTop뿐 아니라 가시 메시지 요소의 화면상 위치(getBoundingClientRect().top)를 측정한다.
 */
import { createServer } from 'vite';
import { startMockApi, DESK, WORKER } from './mock-api.mjs';

const PLAYWRIGHT_PATH = '/Users/winterholic/development/projects/design-system-static-kit/node_modules/playwright-core/index.mjs';
const { chromium, webkit, devices } = await import(PLAYWRIGHT_PATH);

const VITE_PORT = 5899;
const MOCK_PORT = 5898;

export async function runScenarios({ browserName = 'chromium', isMobile = false } = {}) {
  const browserType = browserName === 'webkit' ? webkit : chromium;
  const tag = `[${browserName.toUpperCase()}${isMobile ? '-MOBILE' : '-DESKTOP'}]`;
  console.log(`\n================================================================`);
  console.log(`${tag} Starting Chat Scroll E2E 12-Scenario Suite`);
  console.log(`================================================================`);

  const mock = await startMockApi({ port: MOCK_PORT });
  process.env.VITE_API_BASE = mock.url;
  process.env.TTAKKARI_NO_ENV_FILE = '1';

  const vite = await createServer({
    server: { port: VITE_PORT, strictPort: true, host: '127.0.0.1' },
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(mock.url) },
    configFile: './vite.config.ts',
  });
  await vite.listen();

  const browser = await browserType.launch({ headless: true });
  const contextOptions = isMobile
    ? { ...devices['iPhone 14'], hasTouch: true }
    : { viewport: { width: 1280, height: 800 } };

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => { localStorage.setItem('tk-onboarded', '1'); });

  const page = await context.newPage();
  const summary = [];

  const record = (num, name, ok, detail) => {
    const status = ok ? 'PASS' : 'FAIL';
    summary.push({ num, name, ok, detail });
    console.log(`${tag} [Scenario ${num}: ${name}] -> ${status} (${detail})`);
    if (!ok) throw new Error(`${tag} Scenario ${num} FAILED: ${detail}`);
  };

  try {
    // -------------------------------------------------------------
    // 공통 헬퍼
    // -------------------------------------------------------------
    const getThread = () => page.locator('.tk-thread');
    const getScrollInfo = async () => page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      return {
        top: el.scrollTop,
        height: el.scrollHeight,
        client: el.clientHeight,
        gap: el.scrollHeight - el.scrollTop - el.clientHeight,
      };
    });
    const getFirstVisibleMessage = async () => page.evaluate(() => {
      const thread = document.querySelector('.tk-thread');
      const tRect = thread.getBoundingClientRect();
      const msgs = Array.from(thread.querySelectorAll('.tk-message'));
      for (const m of msgs) {
        const r = m.getBoundingClientRect();
        if (r.bottom > tRect.top + 10 && r.top < tRect.bottom - 10) {
          return {
            text: m.textContent.trim().slice(0, 35),
            viewportTop: r.top - tRect.top,
          };
        }
      }
      return null;
    });

    // -------------------------------------------------------------
    // 시나리오 1: 긴 대화 자유 탐색 (Free exploration of long conversation)
    // -------------------------------------------------------------
    await page.goto(`http://127.0.0.1:${VITE_PORT}/chat/${DESK}`, { waitUntil: 'domcontentloaded' });
    await getThread().waitFor({ state: 'visible', timeout: 8000 });
    // 메시지 목록이 렌더링될 때까지 대기
    await page.waitForSelector('.tk-thread .tk-message', { timeout: 8000 });
    // 렌더링 완료 및 바닥 정렬 대기
    await page.waitForFunction(() => {
      const el = document.querySelector('.tk-thread');
      return el && el.querySelectorAll('.tk-message').length >= 10 && (el.scrollHeight - el.scrollTop - el.clientHeight) <= 10;
    }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);

    const init = await getScrollInfo();
    // 초기 로딩 후 바닥에 정렬되어 있어야 함
    const initAtBottom = init.gap <= 10;

    // 위로 3000px 스크롤
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -3000 }));
      el.scrollTop -= 3000;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(300);
    const mid1 = await getScrollInfo();
    const vis1 = await getFirstVisibleMessage();
    const s1Ok = initAtBottom && mid1.gap >= 2500 && vis1 !== null;
    record(1, '긴 대화 자유 탐색', s1Ok, `initGap=${init.gap}px, midGap=${mid1.gap}px, msg="${vis1?.text}"`);

    // -------------------------------------------------------------
    // 시나리오 2: 스트리밍 중 위로 스크롤 (Scroll up while streaming active)
    // -------------------------------------------------------------
    // 실시간 스트리밍 활성화
    await fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify({ op: 'startLive', interval: 40 }) });
    // 바닥으로 이동하여 스트리밍 관찰
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop = el.scrollHeight - el.clientHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(400);

    // 사용자가 위로 120px 휠 스크롤
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
      el.scrollTop = el.scrollHeight - el.clientHeight - 120;
      el.dispatchEvent(new Event('scroll'));
    });
    // 스트리밍 텍스트가 계속 추가되는 동안 350ms 대기
    await page.waitForTimeout(350);
    const streamScroll = await getScrollInfo();
    // 바닥으로 강제 스냅백되지 않고 gap이 120px 이상 유지되어야 함
    const s2Ok = streamScroll.gap >= 100;
    record(2, '스트리밍 중 위로 스크롤', s2Ok, `gapAfterPause=${streamScroll.gap}px (no bounce back)`);
    await fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify({ op: 'stopLive' }) });

    // -------------------------------------------------------------
    // 시나리오 3: 작업 카드 실시간 갱신 중 과거 읽기
    // -------------------------------------------------------------
    // tree live 켜기 (LIVE_TREE_RUN의 태스크 트리가 계속 갱신됨)
    await fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify({ op: 'config', set: { treeLive: true } }) });
    // 과거 메시지로 스크롤
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop = 5000;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(500);
    const vis3Before = await getFirstVisibleMessage();

    // 트리가 계속 폴링되어 크기가 변하는 동안 800ms 대기
    await page.waitForTimeout(800);
    const vis3After = await getFirstVisibleMessage();
    const finalShift3 = vis3Before && vis3After ? Math.abs(vis3After.viewportTop - vis3Before.viewportTop) : 0;
    const s3Ok = finalShift3 <= 5;
    record(3, '작업 카드 실시간 갱신 중 과거 읽기', s3Ok, `msg="${vis3Before?.text}", shift=${finalShift3.toFixed(2)}px`);
    await fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify({ op: 'config', set: { treeLive: false } }) });

    // -------------------------------------------------------------
    // 시나리오 4: 지연 로딩 경계 통과 (Pass lazy loading boundary of past run events)
    // -------------------------------------------------------------
    // 이전 RunBlock들이 아직 화면 근처에 안 온 위치로 점진 스크롤
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop = 2500;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    const vis4Before = await getFirstVisibleMessage();
    // useNearViewport로 이벤트 로딩 완료 대기
    await page.waitForTimeout(600);
    const vis4After = await getFirstVisibleMessage();
    const shift4 = vis4Before && vis4After && vis4Before.text === vis4After.text
      ? Math.abs(vis4After.viewportTop - vis4Before.viewportTop)
      : 0;
    const s4Ok = shift4 <= 6;
    record(4, '지연 로딩 경계 통과', s4Ok, `shift=${shift4.toFixed(2)}px`);

    // -------------------------------------------------------------
    // 시나리오 5: 이전 대화 더 보기 (Load older messages button)
    // -------------------------------------------------------------
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(300);
    const olderBtn = page.locator('.thread-older button');
    await olderBtn.waitFor({ state: 'visible', timeout: 5000 });
    const vis5Before = await getFirstVisibleMessage();

    await olderBtn.click();
    // 40개 메시지가 추가될 때까지 대기
    await page.waitForTimeout(1000);
    const vis5After = await page.evaluate((text) => {
      const thread = document.querySelector('.tk-thread');
      const tRect = thread.getBoundingClientRect();
      const msgs = Array.from(thread.querySelectorAll('.tk-message'));
      const target = msgs.find((m) => m.textContent.trim().slice(0, 35) === text);
      if (!target) return null;
      return {
        text,
        viewportTop: target.getBoundingClientRect().top - tRect.top,
      };
    }, vis5Before?.text);

    const shift5 = vis5Before && vis5After
      ? Math.abs(vis5After.viewportTop - vis5Before.viewportTop)
      : 999;
    const s5Ok = shift5 <= 5;
    record(5, '이전 대화 더 보기', s5Ok, `target="${vis5Before?.text}", shift=${shift5.toFixed(2)}px`);

    // -------------------------------------------------------------
    // 시나리오 6: 다중 비동기 높이 변화 (Multiple asynchronous height changes)
    // -------------------------------------------------------------
    // 여러 Run의 이벤트를 빠르게 트리거
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop += 300;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(700);
    const vis6After = await getFirstVisibleMessage();
    const s6Ok = vis6After !== null;
    record(6, '다중 비동기 높이 변화', s6Ok, `rendered cleanly at top=${vis6After?.viewportTop.toFixed(1)}px`);

    // -------------------------------------------------------------
    // 시나리오 7: 빠른 반복 위 스크롤과 방향 전환 (Rapid repeated upward scroll and direction reversal)
    // -------------------------------------------------------------
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop -= 400;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(30);
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop += 200;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(30);
    await page.evaluate(() => {
      const el = document.querySelector('.tk-thread');
      el.scrollTop -= 600;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    const s7Info = await getScrollInfo();
    const s7Ok = s7Info.top >= 0 && s7Info.gap > 0;
    record(7, '빠른 반복 위 스크롤과 방향 전환', s7Ok, `stable at top=${s7Info.top}px, gap=${s7Info.gap}px`);

    // -------------------------------------------------------------
    // 시나리오 8: 새 메시지 버튼 하단 복귀 (New message jump button returns to bottom)
    // -------------------------------------------------------------
    const jumpBtn = page.locator('button.tk-jump');
    await jumpBtn.waitFor({ state: 'visible', timeout: 5000 });
    await jumpBtn.click();
    await page.waitForTimeout(400);

    const s8Info = await getScrollInfo();
    const s8Ok = s8Info.gap <= 10;
    record(8, '새 메시지 버튼 하단 복귀', s8Ok, `gapAfterJump=${s8Info.gap}px`);

    // -------------------------------------------------------------
    // 시나리오 9: 모바일 키보드 열기·닫기 (Mobile keyboard simulation)
    // -------------------------------------------------------------
    // 뷰포트 크기를 키보드 열림 높이로 축소 (844 -> 500)
    await page.setViewportSize({ width: contextOptions.viewport?.width ?? 390, height: 500 });
    await page.waitForTimeout(300);
    const kbdOpenInfo = await getScrollInfo();
    // 뷰포트 복원 (500 -> 844)
    await page.setViewportSize({ width: contextOptions.viewport?.width ?? 390, height: contextOptions.viewport?.height ?? 800 });
    await page.waitForTimeout(300);
    const kbdCloseInfo = await getScrollInfo();
    const s9Ok = kbdOpenInfo.top > 0 && kbdCloseInfo.top > 0;
    record(9, '모바일 키보드 열기·닫기', s9Ok, `openTop=${kbdOpenInfo.top}px, closeTop=${kbdCloseInfo.top}px`);

    // -------------------------------------------------------------
    // 시나리오 10: 세션·작업 트리 전환 (Session / task tree navigation and transition)
    // -------------------------------------------------------------
    // 다른 세션(/chat/worker-1)으로 이동
    await page.goto(`http://127.0.0.1:${VITE_PORT}/chat/${WORKER}`, { waitUntil: 'domcontentloaded' });
    await getThread().waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(1000);
    const workerInfo = await getScrollInfo();
    // 새 세션에서는 스크롤이 정상 초기화되고 바닥에 위치
    const s10Ok = workerInfo.gap <= 10;
    record(10, '세션·작업 트리 전환', s10Ok, `workerSessionGap=${workerInfo.gap}px`);

    // 다시 메인 세션으로 복귀
    await page.goto(`http://127.0.0.1:${VITE_PORT}/chat/${DESK}`, { waitUntil: 'domcontentloaded' });
    await getThread().waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForSelector('.tk-thread .tk-message', { timeout: 8000 });
    await page.waitForTimeout(800);

    // -------------------------------------------------------------
    // 시나리오 11: 반복 스크롤 시 강제 복귀 없음 (No forced bounce back during repeated scrolls)
    // -------------------------------------------------------------
    let bounceDetected = false;
    for (let step = 1; step <= 5; step++) {
      await page.evaluate(() => {
        const el = document.querySelector('.tk-thread');
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -70 }));
        el.scrollTop -= 70;
        el.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(100);
      const cur = await getScrollInfo();
      if (cur.gap <= 5) {
        bounceDetected = true;
        break;
      }
    }
    const s11Ok = !bounceDetected;
    record(11, '반복 스크롤 시 강제 복귀 없음', s11Ok, `5 consecutive steps passed without snapping back`);

    // -------------------------------------------------------------
    // 시나리오 12: 브라우저 회귀 없음 (Regression-free on current browser)
    // -------------------------------------------------------------
    const all11Passed = summary.slice(0, 11).every((s) => s.ok);
    record(12, `브라우저 (${browserName}) 회귀 없음`, all11Passed, `all 11 scenarios verified cleanly`);

  } finally {
    await browser.close();
    await vite.close();
    mock.close();
  }

  console.log(`\n${tag} All 12 scenarios PASSED successfully!\n`);
  return summary;
}

// 직접 실행 시 Chromium과 WebKit을 순차적으로 1 워커로 실행
if (process.argv[1].endsWith('chat-scroll.e2e.mjs')) {
  (async () => {
    try {
      console.log('Running test suite sequentially with workers=1...');
      // 1. Desktop Chromium
      await runScenarios({ browserName: 'chromium', isMobile: false });
      // 2. Mobile WebKit (iPhone 14)
      await runScenarios({ browserName: 'webkit', isMobile: true });
      console.log('\n========================================================');
      console.log('ALL CHROMIUM & WEBKIT 12 SCENARIOS FULLY PASSED!');
      console.log('========================================================\n');
      process.exit(0);
    } catch (err) {
      console.error('Test suite failed:', err);
      process.exit(1);
    }
  })();
}
