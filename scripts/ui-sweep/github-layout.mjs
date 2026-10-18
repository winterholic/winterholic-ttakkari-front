// GitHub 탐색 레이아웃 회귀 검사. 디자인 시스템의 ttakkari-layout.check.mjs 는 넘침·잘림·터치 크기를 보지만 아래 네 가지는 보지 못해서 실제로 깨진 채 배포됐다.
//   1. 저장소 홈 바로가기 타일이 서로 겹침(.gh-tile 이 height:100% 인데 box-sizing 이 content-box 라 padding 만큼 행을 넘었다)
//   2. 본문 안 알림 띠(.tk-banner)의 아이콘이 글자 위 줄로 밀리고 <p> 기본 여백이 gap 에 더해져 이중 간격이 됨
//   3. 코드·diff 칸의 오른쪽 안쪽 여백이 0(디자인 시스템 .tk-diff__table td { padding: 0 } 이 .tk-diff__code 를 덮어씀)
//   4. 줄바꿈을 켜도 diff hunk 머리글이 white-space: pre 라 가로로 잘림
//   5. 터치 기기에서 diff 파일 머리 버튼과 필터 입력의 높이가 44px 미만
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/github-layout.mjs --url=http://127.0.0.1:5399 [--widths=320,390,1440] [--shots=/tmp/gh-shots] [--no-fail]
/* global document, getComputedStyle */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5399').replace(/\/$/, '');
const widths = String(args.widths ?? '320,390,1440').split(',');
const shots = args.shots ? resolve(String(args.shots)) : null;
const { chromium, devices } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const stubModule = await import(pathToFileURL(resolve(new URL('./stub.mjs', import.meta.url).pathname)).href);
const stub = stubModule.default;
if (shots) await mkdir(shots, { recursive: true });

const PROFILES = {
  320: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone SE'].userAgent },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone 14'].userAgent },
  1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

// 페이지 안에서 도는 검사들. 각각 문제 문장 배열을 돌려준다.
const checks = {
  tiles: () => {
    const lis = [...document.querySelectorAll('.gh-grid > li')];
    if (lis.length < 2) return ['바로가기 타일을 찾지 못했다'];
    const out = [];
    const rects = lis.map((li) => li.querySelector('.gh-tile').getBoundingClientRect());
    lis.forEach((li, i) => {
      const lr = li.getBoundingClientRect();
      if (rects[i].height > lr.height + 1) out.push(`타일 ${i} 높이 ${Math.round(rects[i].height)} 가 칸 높이 ${Math.round(lr.height)} 를 넘는다`);
    });
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`타일 ${i} 와 ${j} 가 겹친다`);
      }
    }
    return out;
  },
  banners: () => {
    const bs = [...document.querySelectorAll('.gh .tk-banner')];
    if (!bs.length) return ['본문 안 알림 띠를 찾지 못했다'];
    const out = [];
    bs.forEach((b, i) => {
      const s = getComputedStyle(b);
      if (parseFloat(s.marginTop) > 0 || parseFloat(s.marginBottom) > 0) out.push(`띠 ${i} 에 <p> 기본 여백 ${s.marginTop}/${s.marginBottom} 이 남아 gap 과 겹친다`);
      const icon = b.querySelector('.tk-icon');
      const text = b.querySelector('.tk-banner__text');
      if (icon && text && icon.getBoundingClientRect().bottom <= text.getBoundingClientRect().top + 1) out.push(`띠 ${i} 의 아이콘이 글자 위 줄로 밀렸다`);
      if (parseFloat(s.borderTopWidth) === 0 || parseFloat(s.borderTopLeftRadius) === 0) out.push(`띠 ${i} 가 카드 모양(테두리·둥근 모서리)이 아니다`);
    });
    return out;
  },
  codePadding: () => {
    const cell = document.querySelector('.gh-codebox .tk-diff__code');
    if (!cell) return ['코드 칸을 찾지 못했다'];
    return parseFloat(getComputedStyle(cell).paddingRight) > 0 ? [] : ['코드 칸 오른쪽 안쪽 여백이 0 이다'];
  },
  diffHeaderHit: () => {
    const b = document.querySelector('.gh-diff .tk-diff__file > button');
    if (!b) return ['diff 파일 머리 버튼을 찾지 못했다'];
    const h = b.getBoundingClientRect().height;
    return h >= 43.5 ? [] : [`diff 파일 머리 버튼 높이 ${Math.round(h)}px (기준 44px)`];
  },
  inputHeight: () => {
    const i = document.querySelector('.gh-target__row > input');
    if (!i) return ['필터 입력을 찾지 못했다'];
    const h = i.getBoundingClientRect().height;
    return h >= 43.5 ? [] : [`필터 입력 높이 ${Math.round(h)}px (기준 44px)`];
  },
  hunkWrap: () => {
    const td = document.querySelector('.gh-diff[data-wrap] .tk-diff__hunk > td');
    if (!td) return ['줄바꿈을 켠 diff hunk 머리글을 찾지 못했다'];
    const body = td.closest('.tk-diff__body');
    const out = [];
    if (getComputedStyle(td).whiteSpace === 'pre') out.push('줄바꿈을 켰는데 hunk 머리글이 white-space: pre 이다');
    if (body.scrollWidth > body.clientWidth + 1) out.push(`줄바꿈을 켰는데 diff 가 가로로 넘친다 ${body.scrollWidth}/${body.clientWidth}`);
    return out;
  },
};

// 알림 띠는 stale·호출 한도 낮음 응답에서만 그려진다. 합성 응답에 그 두 플래그를 얹는다.
const withNotes = (page) => page.route((u) => /\/api\/github\/repos\/alice\/demo\/pulls$/.test(u.pathname), async (route) => {
  const url = new URL(route.request().url());
  const j = stubModule.body(url.pathname.replace(/^\/api\//, ''), 'GET', url.search);
  await route.fulfill({
    json: { ...j, stale: true, rate: { ...(j.rate ?? {}), remaining: 12, low: true } },
    headers: { 'access-control-allow-origin': route.request().headers().origin ?? '*', 'access-control-allow-credentials': 'true' },
  });
});

// 터치 기준(pointer: coarse)은 폰 폭에서만 의미가 있다. 데스크톱 폭에서는 건너뛴다.
const TOUCH_ONLY = new Set(['diff-header-hit', 'input-height']);

const SCENES = [
  ['tiles', '/github/alice/demo?as=alice', async () => {}, checks.tiles],
  ['banners', '/github/alice/demo/pulls?as=alice', async () => {}, checks.banners, withNotes],
  ['code-padding', '/github/alice/demo/code?as=alice&path=src/index.ts', async () => {}, checks.codePadding],
  ['diff-header-hit', '/github/alice/demo/pulls/12?as=alice&tab=files', async () => {}, checks.diffHeaderHit],
  ['input-height', '/github/alice/demo/issues?as=alice', async () => {}, checks.inputHeight],
  ['hunk-wrap', '/github/alice/demo/pulls/12?as=alice&tab=files', async (p) => {
    await p.locator('.tk-diff__file > button').first().click();
    await p.getByRole('button', { name: '줄바꿈' }).first().click();
  }, checks.hunkWrap],
];

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
for (const w of widths) {
  for (const [name, route, steps, inPage, setup] of SCENES) {
    if (TOUCH_ONLY.has(name) && Number(w) > 700) continue;
    const ctx = await browser.newContext({ ...PROFILES[w], serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await stub(ctx, page, base);
    if (setup) await setup(page);
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => !document.querySelector('.gh-skeleton'));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await steps(page);
      await page.waitForTimeout(500);
      const issues = await page.evaluate(inPage);
      if (shots) await page.screenshot({ path: join(shots, `gh-${name}-${w}.png`) });
      rows.push({ name, w, ok: issues.length === 0, issues });
    } catch (e) {
      rows.push({ name, w, ok: false, issues: ['실행 오류: ' + String(e.message).split('\n')[0].slice(0, 120)] });
    }
    await ctx.close();
  }
}
await browser.close();
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.w} ${r.name}${r.issues.length ? '\n       - ' + r.issues.join('\n       - ') : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(`GitHub 레이아웃 검사 ${rows.length}건, 실패 ${bad}건`);
process.exit(bad && !args['no-fail'] ? 1 : 0);
