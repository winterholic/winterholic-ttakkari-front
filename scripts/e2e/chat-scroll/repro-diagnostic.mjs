// B1 정밀 재현 스크립트:
// 1. 실시간 스트리밍 중 사용자가 위로 스크롤 시 자동 스크롤 충돌 여부 검증
// 2. 과거 메시지 로드 시 비동기 높이 변화에서 DOM anchor 기반 위치 보존 검증
import { createServer } from 'vite';
import { startMockApi } from './mock-api.mjs';

const PLAYWRIGHT_PATH = '/Users/winterholic/development/projects/design-system-static-kit/node_modules/playwright-core/index.mjs';
const { chromium } = await import(PLAYWRIGHT_PATH);

async function run() {
  const mock = await startMockApi({ port: 5898 });
  process.env.VITE_API_BASE = mock.url;
  process.env.TTAKKARI_NO_ENV_FILE = '1';

  // 페이지 열기 전에 스트리밍 활성화
  await fetch(`${mock.url}/__ctl`, {
    method: 'POST',
    body: JSON.stringify({ op: 'startLive', interval: 50 }),
  });

  const vite = await createServer({
    server: { port: 5899, strictPort: true, host: '127.0.0.1' },
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(mock.url),
    },
    configFile: './vite.config.ts',
  });
  await vite.listen();
  console.log(`[Diagnostic] Vite on 5899, Mock on ${mock.port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // 온보딩 팝업 비활성화
  await context.addInitScript(() => {
    localStorage.setItem('tk-onboarded', '1');
  });

  const page = await context.newPage();

  const results = {
    defect1_autoScrollCollision: null,
    defect2_keepFromBottomRace: null,
  };

  try {
    // 1. 대화창 진입 (/chat/desk-1)
    await page.goto('http://127.0.0.1:5899/chat/desk-1', { waitUntil: 'domcontentloaded' });
    const thread = page.locator('.tk-thread');
    await thread.waitFor({ state: 'visible' });

    // 스트리밍 데이터가 들어오고 있는지 확인
    await page.waitForSelector('.tk-caret, .tk-thinking', { timeout: 5000 });
    console.log('[Diagnostic] Streaming run active and rendering in UI.');

    await page.waitForTimeout(600);
    const initialGap = await thread.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    console.log(`[Diagnostic] Initial gap during stream: ${initialGap}px (should be near 0)`);

    // ==========================================
    // 검증 1: 사용자가 위로 60px 휠 스크롤 (FOLLOW_THRESHOLD 96px 이내)
    // ==========================================
    console.log('[Diagnostic] Simulating user wheel scroll up by 60px while streaming...');
    await thread.evaluate((el) => {
      // wheel 이벤트 발생 (deltaY < 0 -> 위로 스크롤)
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -60 }));
      el.scrollTop = el.scrollHeight - el.clientHeight - 60;
      el.dispatchEvent(new Event('scroll'));
    });

    // 사용자는 60px 위를 보려고 멈춤. 스트리밍 청크가 계속 들어오며 ResizeObserver 발동 대기
    await page.waitForTimeout(300);

    const postStreamGap = await thread.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    console.log(`[Diagnostic] Gap after user paused at 60px: ${postStreamGap}px`);

    if (postStreamGap < 10) {
      console.log('=> DEFECT 1: User scrolled up by 60px, but forced back to bottom (gap = 0)!');
      results.defect1_autoScrollCollision = 'BOUNCE_BACK';
    } else {
      console.log('=> PASSED: Gap preserved without forced bottom bounce! (gap = ' + postStreamGap + 'px)');
      results.defect1_autoScrollCollision = 'PRESERVED';
    }

    // 스트리밍 중지
    await fetch(`${mock.url}/__ctl`, { method: 'POST', body: JSON.stringify({ op: 'stopLive' }) });
    await page.waitForTimeout(300);

    // ==========================================
    // 검증 2: 상단으로 스크롤 후 '이전 대화 더 보기' 클릭 시 DOM anchor 기반 위치 보존
    // ==========================================
    console.log('[Diagnostic] Testing Reference message stability on loadOlder...');
    await thread.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(400);

    const olderBtn = page.locator('.thread-older button');
    await olderBtn.waitFor({ state: 'visible', timeout: 5000 });

    // 사용자가 현재 보고 있는 첫 번째 가시 메시지
    const targetInfoBefore = await page.evaluate(() => {
      const thread = document.querySelector('.tk-thread');
      const tRect = thread.getBoundingClientRect();
      const msgs = Array.from(thread.querySelectorAll('.tk-message'));
      const visible = msgs.find((m) => {
        const r = m.getBoundingClientRect();
        return r.bottom > tRect.top + 20 && r.top < tRect.bottom;
      });
      if (!visible) return null;
      return {
        text: visible.textContent?.slice(0, 30),
        viewportTop: visible.getBoundingClientRect().top,
      };
    });
    console.log('[Diagnostic] Visible reference message before loadOlder:', targetInfoBefore);

    // 더 보기 클릭
    await olderBtn.click();

    // 새 메시지 40개가 앞에 마운트되고 렌더링되는 시간 대기
    await page.waitForTimeout(1000);

    const targetInfoAfter = await page.evaluate((text) => {
      const msgs = Array.from(document.querySelectorAll('.tk-thread .tk-message'));
      const target = msgs.find((m) => m.textContent?.slice(0, 30) === text);
      if (!target) return null;
      return {
        text: target.textContent?.slice(0, 30),
        viewportTop: target.getBoundingClientRect().top,
      };
    }, targetInfoBefore?.text);
    console.log('[Diagnostic] Visible reference message after loadOlder:', targetInfoAfter);

    if (targetInfoBefore && targetInfoAfter) {
      const diff = Math.abs(targetInfoAfter.viewportTop - targetInfoBefore.viewportTop);
      console.log(`[Diagnostic] Visual shift of reference message: ${diff.toFixed(1)}px`);
      if (diff <= 5) {
        console.log(`=> PASSED: Reference message maintained exact screen position! (shift = ${diff.toFixed(1)}px)`);
        results.defect2_keepFromBottomRace = 'STABLE_PRESERVED';
      } else {
        console.log(`=> FAILED: Position shifted by ${diff.toFixed(1)}px`);
        results.defect2_keepFromBottomRace = 'FAILED_SHIFT';
      }
    }

  } finally {
    await browser.close();
    await vite.close();
    mock.close();
  }

  console.log('[Diagnostic Summary]:', results);
}

run().catch((e) => {
  console.error('[Diagnostic Fatal Error]:', e);
  process.exit(1);
});
