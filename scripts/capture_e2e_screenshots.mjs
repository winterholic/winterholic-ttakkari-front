import { chromium, devices } from '/Users/winterholic/development/projects/design-system-static-kit/node_modules/playwright-core/index.mjs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR_CURRENT = resolve('/Users/winterholic/.ttakkari/data/outbox/14530ec6-5b80-4cef-bf2c-6d120691b235');
const OUT_DIR_PROMPT = resolve('/Users/winterholic/.ttakkari/data/outbox/fcdeed3b-4c22-48dd-aaf7-b4204d9b6e0c');

await mkdir(`${OUT_DIR_CURRENT}/screenshots`, { recursive: true });
await mkdir(`${OUT_DIR_PROMPT}/screenshots`, { recursive: true });

const BASE_URL = 'http://localhost:5199';

const MOCK_ITEMS = [
  {
    id: "art-01",
    workspace_id: "w1",
    session_id: "s1",
    run_id: "r1",
    filename: "직접올린_기획서.pdf",
    mime_type: "application/pdf",
    kind: "pdf",
    category: "document",
    source: "upload",
    origin: "user",
    area: "files",
    keep_reason: "direct_upload",
    keep_evidence: null,
    rel_path: "직접올린_기획서.pdf",
    storage_mode: "copy",
    size_bytes: 1420500,
    sha256: "abc01",
    preview_status: "not_required",
    preview_mime: null,
    preview_error: null,
    export_policy: "allow",
    downloadable: true,
    retention_until: null,
    created_at: "2026-10-25T01:30:00Z",
  },
  {
    id: "art-02",
    workspace_id: "w1",
    session_id: "s1",
    run_id: "r1",
    filename: "시장분석_보고서.md",
    mime_type: "text/markdown",
    kind: "markdown",
    category: "document",
    source: "agent_output",
    origin: "agent",
    area: "files",
    keep_reason: "chat_request",
    keep_evidence: {
      session_id: "s1",
      run_id: "r1",
      message_id: "r1",
      user_prompt: "시장 분석해서 내 보관함에 넣어줘",
      instruction: "시장 분석 보고서 만들어서 내 보관함에 넣어줘",
      requested_at: "2026-10-25T02:00:00Z",
    },
    rel_path: "시장분석_보고서.md",
    storage_mode: "copy",
    size_bytes: 42100,
    sha256: "abc02",
    preview_status: "not_required",
    preview_mime: null,
    preview_error: null,
    export_policy: "allow",
    downloadable: true,
    retention_until: null,
    created_at: "2026-10-25T02:00:00Z",
  },
  {
    id: "art-03",
    workspace_id: "w1",
    session_id: "s1",
    run_id: null,
    filename: "등록된_레퍼런스.txt",
    mime_type: "text/plain",
    kind: "code",
    category: "document",
    source: "user_registered",
    origin: "unknown",
    area: "files",
    keep_reason: "direct_register",
    keep_evidence: null,
    rel_path: "등록된_레퍼런스.txt",
    storage_mode: "reference",
    size_bytes: 12500,
    sha256: "abc03",
    preview_status: "not_required",
    preview_mime: null,
    preview_error: null,
    export_policy: "allow",
    downloadable: true,
    retention_until: null,
    created_at: "2026-10-25T02:15:00Z",
  },
  {
    id: "art-04",
    workspace_id: "w1",
    session_id: "s1",
    run_id: "r2",
    filename: "시연영상_데모.mp4",
    mime_type: "video/mp4",
    kind: "video",
    category: "video",
    source: "agent_output",
    origin: "agent",
    area: "agent",
    keep_reason: null,
    keep_evidence: null,
    rel_path: "시연영상_데모.mp4",
    storage_mode: "reference",
    size_bytes: 18450000,
    sha256: "abc04",
    preview_status: "not_required",
    preview_mime: null,
    preview_error: null,
    export_policy: "allow",
    downloadable: true,
    retention_until: null,
    created_at: "2026-10-25T02:30:00Z",
  },
  {
    id: "art-05",
    workspace_id: "w1",
    session_id: "s1",
    run_id: "r2",
    filename: "외부_데이터셋.csv",
    mime_type: "text/csv",
    kind: "sheet",
    category: "spreadsheet",
    source: "external",
    origin: "external",
    area: "agent",
    keep_reason: null,
    keep_evidence: null,
    rel_path: "외부_데이터셋.csv",
    storage_mode: "copy",
    size_bytes: 84000,
    sha256: "abc05",
    preview_status: "not_required",
    preview_mime: null,
    preview_error: null,
    export_policy: "allow",
    downloadable: true,
    retention_until: null,
    created_at: "2026-10-25T02:40:00Z",
  },
  {
    id: "art-06",
    workspace_id: "w1",
    session_id: "s1",
    run_id: "r2",
    filename: "소프트웨어_아키텍처.png",
    mime_type: "image/png",
    kind: "image",
    category: "image",
    source: "agent_output",
    origin: "agent",
    area: "agent",
    keep_reason: null,
    keep_evidence: null,
    rel_path: "소프트웨어_아키텍처.png",
    storage_mode: "copy",
    size_bytes: 350000,
    sha256: "abc06",
    preview_status: "not_required",
    preview_mime: null,
    preview_error: null,
    export_policy: "allow",
    downloadable: true,
    retention_until: null,
    created_at: "2026-10-25T02:50:00Z",
  },
];

async function setupMocks(ctx) {
  await ctx.route('**/api/auth/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'mock-jwt-token-12345' }),
    });
  });

  await ctx.route('**/api/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', username: 'winterholic' }),
    });
  });

  await ctx.route('**/api/auth/login', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'mock-jwt-token-12345' }),
    });
  });

  await ctx.route('**/api/credentials/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true }),
    });
  });

  await ctx.route('**/api/artifacts*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/artifacts') && route.request().method() === 'GET') {
      const area = url.searchParams.get('area') || 'files';
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q');

      let filtered = [...MOCK_ITEMS];
      if (area !== 'all') {
        filtered = filtered.filter((i) => i.area === area);
      }
      if (category && category !== 'all') {
        filtered = filtered.filter((i) => i.category === category);
      }
      if (q) {
        filtered = filtered.filter((i) => i.filename.includes(q));
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
      return;
    }

    const artIdMatch = url.pathname.match(/\/artifacts\/([^/]+)$/);
    if (artIdMatch && route.request().method() === 'GET') {
      const id = artIdMatch[1];
      const found = MOCK_ITEMS.find((i) => i.id === id) || MOCK_ITEMS[0];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(found),
      });
      return;
    }

    route.continue();
  });
}

async function saveBoth(page, filename) {
  const p1 = `${OUT_DIR_CURRENT}/screenshots/${filename}`;
  const p2 = `${OUT_DIR_PROMPT}/screenshots/${filename}`;
  await page.screenshot({ path: p1, fullPage: false });
  await page.screenshot({ path: p2, fullPage: false });
  console.log(`Saved screenshot: ${filename}`);
}

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
  await setupMocks(desktopCtx);

  const page = await desktopCtx.newPage();

  console.log('Navigating to library...');
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Desktop My Library (tab=files)
  await saveBoth(page, '01-desktop-my-library.png');

  // 2. Desktop AI Work Files (tab=agent)
  const agentTab = page.locator('label:has-text("AI 작업 파일")');
  await agentTab.click();
  await page.waitForTimeout(800);
  await saveBoth(page, '02-desktop-ai-work-files.png');

  // 3. Desktop All Files (tab=all)
  const allTab = page.locator('label:has-text("전체")');
  await allTab.click();
  await page.waitForTimeout(800);
  await saveBoth(page, '03-desktop-all-files.png');

  // 4. Desktop Category Filter (문서 클릭)
  const docChip = page.locator('button.tk-chip:has-text("문서")');
  await docChip.click();
  await page.waitForTimeout(800);
  await saveBoth(page, '04-desktop-category-filter.png');

  // 5. Desktop Viewer Detail (보관된 기획서 클릭하여 상세 열기)
  await page.locator('button.tk-chip:has-text("전체")').click();
  await page.waitForTimeout(400);
  await page.locator('label:has-text("내 보관함")').click();
  await page.waitForTimeout(600);

  const itemRow = page.locator('text=시장분석_보고서.md').first();
  await itemRow.click();
  await page.waitForTimeout(1000);

  // 더보기 메뉴 클릭하여 출처/보관사유/보관일시/보관지시문/세션링크 및 빼기 버튼 표시
  const moreBtnDesktop = page.locator('button[aria-label="더보기"]').first();
  if (await moreBtnDesktop.count() > 0) {
    await moreBtnDesktop.click();
    await page.waitForTimeout(500);
  }
  await saveBoth(page, '05-desktop-viewer-detail.png');

  // ---- 2. Mobile Context (iPhone 14: 390x844) ----
  console.log('Setting up Mobile context (390x844)...');
  const mobileCtx = await browser.newContext({
    ...devices['iPhone 14'],
    colorScheme: 'light',
  });
  await mobileCtx.addInitScript(() => {
    localStorage.setItem('tk-onboarded', '1');
  });
  await setupMocks(mobileCtx);

  const mPage = await mobileCtx.newPage();
  await mPage.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(1000);

  // 6. Mobile My Library (390px 가로 스크롤 확인)
  await saveBoth(mPage, '06-mobile-my-library.png');

  // 7. Mobile Viewer Actions
  const mItem = mPage.locator('text=시장분석_보고서.md').first();
  await mItem.click();
  await mPage.waitForTimeout(1000);

  const moreBtnMobile = mPage.locator('button[aria-label="더보기"]').first();
  if (await moreBtnMobile.count() > 0) {
    await moreBtnMobile.click();
    await mPage.waitForTimeout(500);
  }
  await saveBoth(mPage, '07-mobile-viewer-actions.png');

  await browser.close();
  console.log('All 7 screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
