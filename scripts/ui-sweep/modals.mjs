// 모달·팝오버 검사. 페이지만 연 검사(디자인 시스템 ttakkari-layout.check.mjs)는 조건부로 그려지는 모달(계정 추가·일정·작업 등)을 한 번도 열지 않아
// 모달 안의 간격 실수(이중 간격 36, 확인 모달 폭 상속, 라벨 서체 불일치, 13px 체크박스)가 계속 통과했다. 여기서는 대표 모달을 실제로 열어 규칙을 본다.
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/modals.mjs --url=http://127.0.0.1:5399 [--widths=320,390,1440] [--shots=/tmp/modal-shots] [--no-fail]
// 규칙 이름과 고치는 법: winterholic-design-system/ttakkari/docs/22-ui-error-prevention.md (B9~B13 · C8~C14)
/* global document, innerWidth, innerHeight, getComputedStyle */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5399').replace(/\/$/, '');
const widths = String(args.widths ?? '320,390,1440').split(',');
const shots = args.shots ? resolve(String(args.shots)) : null;
const { chromium, devices } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const stub = (await import(pathToFileURL(resolve(new URL('./stub.mjs', import.meta.url).pathname)).href)).default;
if (shots) await mkdir(shots, { recursive: true });

const PROFILES = {
  320: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone SE'].userAgent },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone 14'].userAgent },
  1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const btn = (p, name) => p.getByRole('button', { name }).first();
const navOpen = async (p) => { if (p.viewportSize().width < 1024) await p.locator('header button').first().click(); };
const openUserMenu = async (p) => { await navOpen(p); await p.locator('.app-user-menu__trigger:visible').first().click(); };
const acct = (p) => p.locator('button[aria-haspopup="dialog"][aria-label$=" 메뉴"]').first().click();

// [이름, 경로, 여는 단계]. 모달이 없으면(열리지 않으면) 실패로 센다.
const SCENES = [
  ['account-add', '/settings', (p) => btn(p, '계정 추가').click()],
  ['account-edit', '/settings', async (p) => { await acct(p); await btn(p, '이름·사용 상한').click(); }],
  ['account-remove', '/settings', async (p) => { await acct(p); await btn(p, '삭제').click(); }],
  ['account-override', '/settings', (p) => btn(p, '임시 순서').click()],
  ['usage', '/settings', async (p) => { await openUserMenu(p); await p.getByRole('menuitem', { name: '사용량' }).click(); }],
  ['push', '/settings', async (p) => { await openUserMenu(p); await p.getByRole('menuitem', { name: '푸시 알림 설정' }).click(); }],
  ['user-menu', '/settings', openUserMenu],
  ['memo-categories', '/memos', (p) => btn(p, '편집').click()],
  ['memo-delete', '/memos/memo1', (p) => p.getByRole('button', { name: /지우기|삭제/ }).first().click(), 1440],
  ['calendar-event-new', '/calendar', (p) => btn(p, '일정').click()],
  ['calendar-event-edit', '/calendar?view=list', (p) => p.getByText('주간 회의').first().click()],
  ['pms-project-new', '/pms', (p) => btn(p, '새 프로젝트').click()],
  ['pms-task-new', '/pms/p1/board', (p) => p.locator('button[aria-label*="추가"]').first().click()],
  ['pms-task-edit', '/pms/p1/board', (p) => p.getByText('작업 2 칸반 카드 제목').first().click()],
  ['pms-project-settings', '/pms/p1/board', async (p) => { await p.locator('.tk-header button[aria-haspopup]').last().click(); await p.getByRole('menuitem', { name: /설정/ }).click(); }],
  ['pms-note-new', '/pms/p1/notes', (p) => btn(p, '이슈·리스크 추가').click()],
  ['checklist-edit', '/checklists?mode=edit', (p) => p.locator('[aria-label$=" 수정"]').first().click()],
  ['checklist-delete', '/checklists?mode=edit', (p) => p.locator('[aria-label$=" 삭제"]').first().click()],
  ['meeting-delete', '/meetings/m1', (p) => p.locator('[aria-label="회의록 지우기"]').click()],
  ['meeting-share', '/meetings/m1', (p) => btn(p, '공유').click()],
  ['meeting-download', '/meetings/m1', (p) => btn(p, '다운로드').click()],
  ['meeting-scope', '/meetings/m1', async (p) => { await p.getByRole('combobox').first().click(); await p.getByRole('option', { name: '개인' }).click(); }],
  ['onboarding', '/chat', () => {}, null, true],
];

// 페이지 안에서 도는 검사. 가장 위에 열린 <dialog>(드로어 안에 중첩된 것 포함) 또는 메뉴를 본다.
const inPage = () => {
  const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const name = (el) => el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.');
  const root = [...document.querySelectorAll('dialog[open]')].pop() ?? document.querySelector('.tk-menu:not([hidden])');
  const issues = [];
  if (!root) return { opened: false, issues };
  const rr = root.getBoundingClientRect();
  const out = { opened: true, kind: root.matches('dialog') ? 'dialog' : 'menu', rect: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)], issues };

  // B9 이중 간격: gap 이 있는 flex/grid 부모의 흐름 방향 자식 margin 이 6 을 넘는다. fieldset 의 legend 는 flex 항목이 아니라 제외.
  for (const el of root.querySelectorAll('*')) {
    if (!vis(el) || el.matches('legend') || el.closest('svg')) continue;
    const p = el.parentElement;
    const ps = getComputedStyle(p);
    if (!(ps.display.includes('flex') || ps.display.includes('grid'))) continue;
    if (!(parseFloat(ps.rowGap) > 0 || parseFloat(ps.columnGap) > 0)) continue;
    const s = getComputedStyle(el);
    if (s.position === 'absolute') continue;
    const col = ps.display.includes('grid') || ps.flexDirection.startsWith('column');
    const sides = ps.display.includes('grid') ? ['Top', 'Bottom', 'Left', 'Right'] : col ? ['Top', 'Bottom'] : ['Left', 'Right'];
    const big = sides.map((k) => [k, parseFloat(s['margin' + k])]).filter(([, v]) => v > 6 && v < 48); // 48 이상은 margin: auto 의 계산값
    if (big.length) issues.push(`gap-plus-margin ${name(el)} 부모 gap ${ps.rowGap}/${ps.columnGap} + margin ${big.map(([k, v]) => k + v).join(',')}`);
  }

  if (root.matches('dialog')) {
    // C4 폭: 선언한 크기(sm 400 · 기본 560 · lg 720)와 같아야 한다. 중첩 모달이 부모의 폭 변수를 물려받으면 어긋난다.
    const tok = (n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n));
    const want = root.classList.contains('tk-dialog--sm') ? tok('--tk-component-dialog-width-sm') : root.classList.contains('tk-dialog--lg') ? tok('--tk-component-dialog-width-lg') : tok('--tk-component-dialog-width-md');
    if (root.classList.contains('tk-dialog') && rr.width > want + 1) issues.push(`dialog-width ${Math.round(rr.width)} > 선언 ${want}`);
    // C5 확인 질문("…할까요?")은 sm
    const title = root.querySelector('.tk-dialog__title')?.textContent ?? '';
    if (/[?？]$/.test(title.trim()) && !root.classList.contains('tk-dialog--sm') && !root.querySelector('form')) issues.push(`confirm-not-sm "${title.trim().slice(0, 24)}" 확인 모달은 size="sm"`);
    // C6 폼 라벨: .tk-field 첫 자식 라벨은 .tk-label(medium) 서체
    for (const f of root.querySelectorAll('.tk-field')) {
      const l = f.firstElementChild;
      if (l && l.matches('label,span') && l.textContent.trim() && !l.matches('.tk-label,.tk-input-wrap,.tk-select,.tk-chips,.tk-segmented') && !l.querySelector('input,select,textarea') && parseFloat(getComputedStyle(l).fontWeight) < 500 && !l.matches('.tk-help,.tk-error')) issues.push(`label-style "${l.textContent.trim().slice(0, 14)}" 은 .tk-label 이 필요`);
    }
    // C7 체크박스: 네이티브 13px 대신 디자인 시스템 체크박스(.tk-checkbox)
    for (const c of root.querySelectorAll('input[type=checkbox]:not([role=switch])')) if (vis(c) && c.getBoundingClientRect().width < 16) issues.push('native-checkbox ' + Math.round(c.getBoundingClientRect().width) + 'px');
    // 본문 위아래 빈 공간(모달 본문 padding 외에 더 비면 과하다): 첫·마지막 보이는 자손과 본문 가장자리
    const body = root.querySelector('.tk-dialog__body');
    if (body) {
      const kids = [...body.querySelectorAll('*')].filter(vis).filter((e) => !e.closest('svg'));
      if (kids.length && body.scrollHeight <= body.clientHeight + 1) {
        const bb = body.getBoundingClientRect();
        const top = Math.min(...kids.map((e) => e.getBoundingClientRect().top)) - bb.top;
        const bottom = bb.bottom - Math.max(...kids.map((e) => e.getBoundingClientRect().bottom));
        if (top > 24 || bottom > 24) issues.push(`body-air 위 ${Math.round(top)} · 아래 ${Math.round(bottom)} (padding 16~20 이어야 한다)`);
      }
    }
    // 모달 밖으로 새는 자식
    for (const el of root.querySelectorAll('*')) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.right > rr.right + 1 || b.left < rr.left - 1) {
        let clipped = false;
        for (let n = el.parentElement; n && n !== root; n = n.parentElement) if (getComputedStyle(n).overflowX !== 'visible') { clipped = true; break; }
        if (!clipped) { issues.push(`dialog-child-escapes ${name(el)} ${Math.round(b.left)}..${Math.round(b.right)}`); break; }
      }
    }
    // 화면 안
    if (rr.left < -1 || rr.right > innerWidth + 1 || rr.top < -1 || rr.bottom > innerHeight + 1) issues.push('dialog-outside-viewport');
  } else {
    // 메뉴가 항목을 스크롤 뒤에 숨기는지: 사용자 메뉴는 로그아웃까지 보여야 한다
    if (root.scrollHeight > root.clientHeight + 1 && root.closest('.app-user-menu')) issues.push(`menu-clipped 내용 ${root.scrollHeight} > 상자 ${root.clientHeight} (로그아웃이 스크롤 뒤)`);
  }
  return out;
};

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
for (const w of widths) {
  for (const [name, route, steps, onlyWidth, fresh] of SCENES) {
    if (onlyWidth && String(onlyWidth) !== w) continue;
    const ctx = await browser.newContext({ ...PROFILES[w], serviceWorkers: 'block' });
    if (fresh) await ctx.addInitScript("try { localStorage.removeItem('tk-onboarded') } catch {}");
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await stub(ctx, page, base);
    if (fresh) await ctx.addInitScript("try { localStorage.removeItem('tk-onboarded') } catch {}");
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await steps(page);
      await page.waitForTimeout(700);
      const m = await page.evaluate(inPage);
      if (shots) await page.screenshot({ path: join(shots, `${name}-${w}.png`) });
      rows.push({ name, w, ...m, ok: m.opened && m.issues.length === 0, issues: m.opened ? m.issues : ['모달·메뉴가 열리지 않았다'] });
    } catch (e) {
      rows.push({ name, w, ok: false, issues: ['실행 오류: ' + String(e.message).split('\n')[0].slice(0, 120)] });
    }
    await ctx.close();
  }
}
await browser.close();
if (shots) await writeFile(join(shots, 'modals-metrics.json'), JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.w} ${r.name}${r.rect ? ' ' + r.rect.slice(2).join('×') : ''}${r.issues.length ? '\n       - ' + r.issues.join('\n       - ') : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(`모달 검사 ${rows.length}건, 실패 ${bad}건`);
process.exit(bad && !args['no-fail'] ? 1 : 0);
