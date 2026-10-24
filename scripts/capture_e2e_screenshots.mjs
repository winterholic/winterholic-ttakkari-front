import { chromium, devices } from '/Users/winterholic/development/projects/design-system-static-kit/node_modules/playwright-core/index.mjs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve('/Users/winterholic/.ttakkari/data/outbox/ea324e41-d3f2-47a0-9741-58c71f9efdb4/screenshots');
const OUT_DIR_COPY = resolve('/Users/winterholic/.ttakkari/data/outbox/68d9e4e0-3533-4768-813a-6ef8a87f8eed/screenshots');
await mkdir(OUT_DIR, { recursive: true });
await mkdir(OUT_DIR_COPY, { recursive: true });

const BASE_URL = 'http://localhost:5199';

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  // ---- 1. Desktop Context (1280x800) ----
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });
  await desktopCtx.addInitScript(() => {
    localStorage.setItem('tk-onboarded', '1');
  });

  const page = await desktopCtx.newPage();

  console.log('Navigating to login / library...');
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 로그인 화면 감지 시 비밀번호 입력
  const pwdInput = await page.$('input[type="password"]');
  if (pwdInput) {
    console.log('Login form detected. Logging in...');
    await pwdInput.fill('password123456');
    const submitBtn = await page.$('button[type="submit"]') || await page.$('button');
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // 온보딩 모달이 혹시라도 떠 있으면 닫기
  try {
    const obClose = page.locator('#onboarding button');
    if (await obClose.count() > 0) {
      console.log('Closing onboarding dialog...');
      await obClose.last().click({ timeout: 2000 });
      await page.waitForTimeout(500);
    }
  } catch {}

  // Library 페이지로 이동 보장
  if (!page.url().includes('/library')) {
    await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  }

  // 1. Desktop My Library (tab=files)
  console.log('Capturing 01-desktop-my-library.png...');
  await page.screenshot({ path: `${OUT_DIR}/01-desktop-my-library.png`, fullPage: false });
  await page.screenshot({ path: `${OUT_DIR_COPY}/01-desktop-my-library.png`, fullPage: false });

  // 2. Desktop AI Work Files (tab=agent)
  console.log('Capturing 02-desktop-ai-work-files.png...');
  const agentTab = page.locator('label:has-text("AI 작업 파일")');
  await agentTab.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT_DIR}/02-desktop-ai-work-files.png`, fullPage: false });
  await page.screenshot({ path: `${OUT_DIR_COPY}/02-desktop-ai-work-files.png`, fullPage: false });

  // 3. Desktop All Files (tab=all)
  console.log('Capturing 03-desktop-all-files.png...');
  const allTab = page.locator('label:has-text("전체")');
  await allTab.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT_DIR}/03-desktop-all-files.png`, fullPage: false });
  await page.screenshot({ path: `${OUT_DIR_COPY}/03-desktop-all-files.png`, fullPage: false });

  // 4. Desktop Category Filter (문서 클릭)
  console.log('Capturing 04-desktop-category-filter.png...');
  const docChip = page.locator('button.tk-chip:has-text("문서")');
  await docChip.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT_DIR}/04-desktop-category-filter.png`, fullPage: false });
  await page.screenshot({ path: `${OUT_DIR_COPY}/04-desktop-category-filter.png`, fullPage: false });

  // 5. Desktop Viewer Detail (첫 번째 파일 클릭하여 상세 모달 열기)
  console.log('Capturing 05-desktop-viewer-detail.png...');
  // 전체 필터 칩 클릭
  await page.locator('button.tk-chip:has-text("전체")').click();
  await page.waitForTimeout(500);
  // 내 보관함 탭으로 복귀
  await page.locator('label:has-text("내 보관함")').click();
  await page.waitForTimeout(800);

  // 항목 클릭
  const itemRow = page.locator('text=직접올린_기획서.pdf').first();
  await itemRow.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/05-desktop-viewer-detail.png`, fullPage: false });
  await page.screenshot({ path: `${OUT_DIR_COPY}/05-desktop-viewer-detail.png`, fullPage: false });

  // ---- 2. Mobile Context (iPhone 14: 390x844) ----
  console.log('Setting up Mobile context...');
  const mobileCtx = await browser.newContext({
    ...devices['iPhone 14'],
    colorScheme: 'light',
  });
  await mobileCtx.addInitScript(() => {
    localStorage.setItem('tk-onboarded', '1');
  });

  const mPage = await mobileCtx.newPage();

  // Storage / cookies 전파
  const cookies = await desktopCtx.cookies();
  await mobileCtx.addCookies(cookies);

  await mPage.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(1000);

  // 6. Mobile My Library
  console.log('Capturing 06-mobile-my-library.png...');
  await mPage.screenshot({ path: `${OUT_DIR}/06-mobile-my-library.png`, fullPage: false });
  await mPage.screenshot({ path: `${OUT_DIR_COPY}/06-mobile-my-library.png`, fullPage: false });

  // 7. Mobile Viewer Actions (항목 열기 후 상세 메뉴)
  console.log('Capturing 07-mobile-viewer-actions.png...');
  const mItem = mPage.locator('text=직접올린_기획서.pdf').first();
  await mItem.click();
  await mPage.waitForTimeout(1500);

  // 더보기 버튼(점 세 개 또는 액션 메뉴) 클릭
  const moreBtn = mPage.locator('button[aria-label*="더보기"], button:has-text("더보기")').first();
  if (await moreBtn.count() > 0) {
    await moreBtn.click().catch(() => {});
    await mPage.waitForTimeout(600);
  }
  await mPage.screenshot({ path: `${OUT_DIR}/07-mobile-viewer-actions.png`, fullPage: false });
  await mPage.screenshot({ path: `${OUT_DIR_COPY}/07-mobile-viewer-actions.png`, fullPage: false });

  await browser.close();
  console.log('All 7 screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
