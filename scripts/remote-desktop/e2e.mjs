// 원격 데스크톱 모바일 조작 검증(실제 Mac 아님). 합성 RFB 서버(back/unit_tests/remote_desktop_fixture.py)가 받은 포인터·키 이벤트를 기준으로 판정한다.
// 준비: 서버 `PYTHONPATH=src python unit_tests/remote_desktop_fixture.py` (18971), 프런트 `VITE_API_BASE=http://127.0.0.1:18971 pnpm exec vite --port 18970 --host 127.0.0.1`
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/remote-desktop/e2e.mjs --out=/tmp/shots [--browser=chromium|webkit]
// chromium 은 CDP 로 진짜 멀티터치(두 손가락 탭·스크롤·핀치)를 보내고, webkit(iOS Safari 엔진)은 렌더링·탭·키 입력과 합성 PointerEvent 를 본다.
/* global document, window, history, innerHeight, getComputedStyle, DOMMatrix, HTMLCanvasElement, PointerEvent */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const out = resolve(String(args.out ?? '/tmp/remote-desktop-shots'));
const which = String(args.browser ?? 'chromium');
const APP = 'http://127.0.0.1:18970/scripts/remote-desktop/index.html', API = 'http://127.0.0.1:18971';
const { chromium, webkit, devices } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
await mkdir(out, { recursive: true });

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const events = async () => (await (await fetch(`${API}/fixture/events`)).json());
// 서버 기록이 조용해질 때까지(최소 350ms, 최대 4s) 기다린 뒤 그 사이에 쌓인 이벤트만 돌려준다.
async function since(fn) {
  const before = (await events()).length;
  const mark = globalThis.__page ? await globalThis.__page.evaluate(() => window.__sent?.length ?? 0) : 0;
  await fn(); await sleep(350);
  let length = (await events()).length, quiet = 0;
  for (let waited = 0; quiet < 3 && waited < 4000; waited += 100) { await sleep(100); const now = (await events()).length; quiet = now === length ? quiet + 1 : 0; length = now; }
  const got = (await events()).slice(before);
  if (globalThis.__page && process.env.RD_DEBUG) console.log('   [debug] browser sent', JSON.stringify((await globalThis.__page.evaluate(m => (window.__sent ?? []).slice(m), mark))), 'server got', got.length);
  return got;
}
const pointers = list => list.filter(e => e.kind === 'pointer');
const keys = list => list.filter(e => e.kind === 'key').map(e => [e.down, e.key]);

async function open(browser, profile, name) {
  const context = await browser.newContext({ ...profile, locale: 'ko-KR', colorScheme: 'dark' });
  const page = await context.newPage();
  page.on('pageerror', e => check(`${name}: 페이지 오류 없음`, false, String(e)));
  await page.goto(APP);
  await page.getByRole('button', { name: /에 접속$/ }).click();
  await page.getByLabel('따까리 비밀번호').fill('fixture-password');
  await page.getByLabel('Mac 로그인 비밀번호').fill('fixture');
  await page.getByRole('button', { name: '화면 열기' }).click();
  await page.locator('.remote-status-pill:not([data-quality="off"])').waitFor({ timeout: 15000 });
  await sleep(600);
  return { context, page };
}
const surface = page => page.locator('.remote-input');
// 도구 줄은 4초 뒤 숨는다. 버튼을 눌러야 하는 단계 앞에서 핸들로 다시 연다.
async function tools(page) { const handle = page.getByRole('button', { name: '도구 열기' }); if (await handle.count()) { await handle.click(); await sleep(150); } }
async function state(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.remote-canvas');
    const m = new DOMMatrix(getComputedStyle(canvas).transform);
    const cursor = document.querySelector('.remote-cursor').getBoundingClientRect();
    return { x: m.e, y: m.f, scale: m.a, cursor: { x: cursor.left, y: cursor.top, w: cursor.width, h: cursor.height } };
  });
}

// ---- CDP touch helpers (chromium) ----
function touchApi(page, client) {
  const send = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
  return {
    async tap(x, y) { await send('touchStart', [{ x, y }]); await sleep(40); await send('touchEnd', []); },
    async drag(from, to, steps = 10, hold = 0) {
      await send('touchStart', [from]); if (hold) await sleep(hold);
      for (let i = 1; i <= steps; i++) { await send('touchMove', [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }]); await sleep(16); }
      await send('touchEnd', []);
    },
    async twoTap(x, y) { await send('touchStart', [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }]); await sleep(50); await send('touchEnd', []); },
    async twoDrag(x, y, dy, steps = 12) {
      await send('touchStart', [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }]);
      for (let i = 1; i <= steps; i++) { const yy = y + dy * i / steps; await send('touchMove', [{ x: x - 30, y: yy, id: 1 }, { x: x + 30, y: yy, id: 2 }]); await sleep(16); }
      await send('touchEnd', []);
    },
    async pinch(x, y, from, to, steps = 12) {
      await send('touchStart', [{ x: x - from / 2, y, id: 1 }, { x: x + from / 2, y, id: 2 }]);
      for (let i = 1; i <= steps; i++) { const d = from + (to - from) * i / steps; await send('touchMove', [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }]); await sleep(16); }
      await send('touchEnd', []);
    },
    send,
  };
}

async function chromiumSuite(browser) {
  const profile = devices['iPhone 14'];
  const { context, page } = await open(browser, profile, 'chromium');
  const client = await context.newCDPSession(page);
  if (process.env.RD_DEBUG) { globalThis.__page = page; await page.evaluate(() => { window.__sent = []; const ws = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { window.__sent.push(typeof d === 'string' ? 's' : d[0] === 5 ? 'p' + d[1] : d[0] === 4 ? 'k' + d[1] + ':' + d[7] : 'o' + d[0]); return ws.call(this, d); }; }); }
  const t = touchApi(page, client);
  const box = await surface(page).boundingBox();
  const cx = box.width / 2, cy = box.height / 2;

  // 초기 화면: 전체 맞춤, 커서 크기, noVNC 자체 커서 사본 없음
  let s = await state(page);
  check('연결 직후 데스크톱 전체가 보이게 맞춤(1920px → 폰 폭)', Math.abs(s.scale - 390 / 1920) < .01, `scale=${s.scale.toFixed(3)}`);
  check('커서는 화살표 하나, 높이 약 20px(화면 줌과 무관)', s.cursor.h > 15 && s.cursor.h < 26, `cursor ${s.cursor.w.toFixed(1)}×${s.cursor.h.toFixed(1)}`);
  const hiddenDup = await page.evaluate(() => [...document.body.children].filter(e => e instanceof HTMLCanvasElement).every(c => getComputedStyle(c).display === 'none'));
  check('noVNC 가 붙이는 원격 커서 캔버스는 숨김(중복 표시 방지)', hiddenDup);
  check('overscroll·스크롤 바운스 차단', await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY === 'none' && getComputedStyle(document.documentElement).overflow === 'hidden'));
  await page.screenshot({ path: join(out, 'chromium-portrait-fit.png') });

  // 트랙패드: 끌기 = 상대 이동, 클릭 없음
  let log = await since(() => t.drag({ x: 100, y: 500 }, { x: 220, y: 500 }, 12));
  let p = pointers(log);
  check('트랙패드 끌기: 포인터가 오른쪽으로 상대 이동하고 버튼은 눌리지 않음', p.length > 3 && p.at(-1).x > p[0].x + 150 && p.every(e => e.mask === 0), `x ${p[0]?.x}→${p.at(-1)?.x}, n=${p.length}`);
  // 탭 = 클릭(커서 위치)
  const last = p.at(-1);
  log = await since(() => t.tap(300, 560));
  p = pointers(log);
  check('탭: 커서 위치에서 좌클릭(누름→뗌), 탭한 곳으로 점프하지 않음', p.length >= 2 && p[0].mask === 1 && p.at(-1).mask === 0 && Math.abs(p[0].x - last.x) <= 1 && Math.abs(p[0].y - last.y) <= 1, JSON.stringify(p.slice(0, 2)));
  // 더블탭
  log = await since(async () => { await t.tap(300, 560); await sleep(120); await t.tap(300, 560); });
  check('두 번 빠르게 탭: 같은 위치에 클릭 2번(더블클릭)', pointers(log).map(e => e.mask).join() === '1,0,1,0', pointers(log).map(e => e.mask).join());
  // 두 손가락 탭 = 우클릭
  log = await since(() => t.twoTap(cx, cy));
  p = pointers(log);
  check('두 손가락 탭: 우클릭(버튼 마스크 4)이고 좌클릭 없음', p.map(e => e.mask).join() === '4,0', p.map(e => e.mask).join());
  // 두 손가락 스크롤
  log = await since(() => t.twoDrag(cx, 400, 150));
  p = pointers(log);
  check('두 손가락 아래로 끌기: 휠(마스크 8)만 전송, 클릭 없음', p.some(e => e.mask === 8) && p.every(e => e.mask === 0 || e.mask === 8), `wheel steps=${p.filter(e => e.mask === 8).length}`);
  log = await since(() => t.twoDrag(cx, 600, -150));
  check('두 손가락 위로 끌기: 휠(마스크 16)', pointers(log).some(e => e.mask === 16));
  // 길게 눌러 드래그
  log = await since(() => t.drag({ x: 150, y: 450 }, { x: 250, y: 450 }, 10, 520));
  p = pointers(log);
  check('길게 누른 채 끌기: 버튼 누른 상태(1)로 이동하다 손을 떼면 해제', p[0]?.mask === 1 && p.some(e => e.mask === 1 && e.x > p[0].x + 20) && p.at(-1).mask === 0, `masks=${p.map(e => e.mask).join('')}`);
  // 탭 직후 눌러서 끌기
  log = await since(async () => { await t.tap(200, 300); await sleep(100); await t.drag({ x: 200, y: 300 }, { x: 280, y: 300 }, 10); });
  p = pointers(log);
  check('탭 직후 바로 눌러 끌기: 드래그(마스크 1 유지) 후 해제', p.some(e => e.mask === 1 && p.indexOf(e) >= 2) && p.at(-1).mask === 0, `masks=${p.map(e => e.mask).join('')}`);
  // 핀치 줌
  const before = (await state(page)).scale;
  log = await since(() => t.pinch(cx, cy, 80, 240));
  s = await state(page);
  check('핀치: 확대되고 Mac 으로 버튼 입력은 가지 않음', s.scale > before * 1.5 && pointers(log).every(e => e.mask === 0), `scale ${before.toFixed(2)}→${s.scale.toFixed(2)}`);
  await page.screenshot({ path: join(out, 'chromium-portrait-zoomed.png') });
  // 확대 후 커서가 가장자리로 가면 화면이 따라감
  const viewBefore = await state(page);
  await t.drag({ x: 100, y: 500 }, { x: 330, y: 500 }, 14); await t.drag({ x: 100, y: 500 }, { x: 330, y: 500 }, 14); await t.drag({ x: 100, y: 500 }, { x: 330, y: 500 }, 14);
  const viewAfter = await state(page);
  check('확대 상태에서 커서가 가장자리에 가면 화면이 따라 이동', viewAfter.x < viewBefore.x - 20 && viewAfter.cursor.x < 390 && viewAfter.cursor.x > 0, `view.x ${viewBefore.x.toFixed(0)}→${viewAfter.x.toFixed(0)}, cursor.x=${viewAfter.cursor.x.toFixed(0)}`);
  await tools(page); await page.getByRole('button', { name: '화면 전체 보기' }).click(); await sleep(200);
  check('맞춤 버튼으로 전체 보기 복귀', Math.abs((await state(page)).scale - 390 / 1920) < .01);

  // 게임패드
  await tools(page); await page.getByRole('button', { name: '게임패드' }).click(); await sleep(200);
  await page.screenshot({ path: join(out, 'chromium-portrait-pad.png') });
  const stick = await page.locator('.remote-pad__stick').boundingBox();
  const sx = stick.x + stick.width / 2, sy = stick.y + stick.height / 2;
  log = await since(async () => { await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 7 }] }); await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - stick.height / 2, id: 7 }] }); await sleep(600); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); });
  p = pointers(log);
  check('조이스틱을 위로 끝까지 밀면 커서가 계속 이동(버튼 없음), 놓으면 정지', p.length > 5 && p.at(-1).y < p[0].y - 80 && p.every(e => e.mask === 0), `y ${p[0]?.y}→${p.at(-1)?.y}, n=${p.length}`);
  const settled = (await events()).length; await sleep(300);
  check('조이스틱을 놓은 뒤에는 이벤트가 더 나가지 않음', (await events()).length === settled);
  log = await since(async () => { await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 7 }] }); await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy + 10, id: 7 }] }); await sleep(120); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); });
  p = pointers(log);
  const slowSpan = p.length ? Math.abs(p.at(-1).y - p[0].y) : 0;
  check('조이스틱을 살짝 밀면 느리게(정밀) 이동', slowSpan < 40, `span=${slowSpan}`);
  // L 누른 채 조이스틱 = 드래그(멀티터치)
  const left = await page.getByRole('button', { name: '좌클릭' }).boundingBox();
  const lx = left.x + left.width / 2, ly = left.y + left.height / 2;
  log = await since(async () => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lx, y: ly, id: 8 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lx, y: ly, id: 8 }, { x: sx, y: sy, id: 9 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: lx, y: ly, id: 8 }, { x: sx, y: sy + stick.height / 2, id: 9 }] });
    await sleep(500);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  p = pointers(log);
  check('L 을 누른 채 조이스틱: 마스크 1 로 이동(드래그)하고 손 떼면 해제', p[0]?.mask === 1 && p.some(e => e.mask === 1 && e.y > p[0].y + 30) && p.at(-1).mask === 0, `masks=${[...new Set(p.map(e => e.mask))].join('/')} y ${p[0]?.y}→${p.at(-1)?.y}`);
  log = await since(() => t.tap(lx, ly));
  check('L 버튼 탭 = 좌클릭', pointers(log).map(e => e.mask).join() === '1,0');
  const right = await page.getByRole('button', { name: '우클릭' }).boundingBox();
  log = await since(() => t.tap(right.x + right.width / 2, right.y + right.height / 2));
  check('R 버튼 탭 = 우클릭(마스크 4)', pointers(log).map(e => e.mask).join() === '4,0', pointers(log).map(e => e.mask).join());
  const down = await page.getByRole('button', { name: '아래로 스크롤' }).boundingBox();
  log = await since(async () => { await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: down.x + 10, y: down.y + 10, id: 5 }] }); await sleep(900); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); });
  p = pointers(log);
  check('스크롤 버튼 길게 누르면 반복해서 휠(마스크 16) 전송', p.filter(e => e.mask === 16).length >= 4, `steps=${p.filter(e => e.mask === 16).length}`);
  log = await since(() => page.getByRole('button', { name: /드래그 잠금/ }).click());
  check('드래그 잠금: 버튼 누른 상태 유지', pointers(log).at(-1)?.mask === 1, JSON.stringify(log));
  log = await since(() => t.drag({ x: 100, y: 300 }, { x: 160, y: 300 }, 8));
  p = pointers(log);
  check('잠금 중 트랙패드로 끌어도 마스크 1 유지(탭이 잠금을 풀지 않음)', p.length > 3 && p.every(e => e.mask === 1), `masks=${[...new Set(p.map(e => e.mask))].join('/')}`);
  log = await since(() => page.getByRole('button', { name: /드래그 잠금/ }).click());
  check('드래그 잠금 해제', pointers(log).at(-1)?.mask === 0, JSON.stringify(log));

  // 키보드와 보조키
  await tools(page); await page.getByRole('button', { name: '게임패드' }).click();
  await tools(page); await page.getByRole('button', { name: '키보드', exact: true }).click(); await sleep(250);
  const field = page.getByRole('textbox', { name: 'Mac에 입력할 글' });
  check('키보드 버튼을 누르면 입력칸에 포커스(iOS 키보드 호출 조건)', await field.evaluate(el => document.activeElement === el));
  await page.screenshot({ path: join(out, 'chromium-portrait-keyboard.png') });
  log = await since(() => page.keyboard.type('ab'));
  check('입력칸 타이핑이 즉시 Mac 키 이벤트로 전송', JSON.stringify(keys(log)) === JSON.stringify([[1, 97], [0, 97], [1, 98], [0, 98]]), JSON.stringify(keys(log)));
  log = await since(() => page.keyboard.insertText('한'));
  check('한글 완성 글자는 유니코드 keysym 으로 전송(U+D55C)', JSON.stringify(keys(log)) === JSON.stringify([[1, 0x100d55c], [0, 0x100d55c]]), JSON.stringify(keys(log)));
  log = await since(async () => { await page.keyboard.press('Enter'); await page.keyboard.press('Backspace'); });
  check('Enter·Backspace 는 키로 전송', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xff0d], [0, 0xff0d], [1, 0xff08], [0, 0xff08]]), JSON.stringify(keys(log)));
  log = await since(() => page.getByRole('button', { name: '⌘C 복사' }).click());
  check('⌘C 버튼: Cmd 누름 → c → Cmd 뗌', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xffe7], [1, 0x63], [0, 0x63], [0, 0xffe7]]), JSON.stringify(keys(log)));
  log = await since(() => page.getByRole('button', { name: '⌘Tab 앱 전환' }).click());
  check('⌘Tab 버튼', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xffe7], [1, 0xff09], [0, 0xff09], [0, 0xffe7]]));
  log = await since(() => page.getByRole('button', { name: '⌘Space Spotlight' }).click());
  check('⌘Space 버튼', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xffe7], [1, 0x20], [0, 0x20], [0, 0xffe7]]));
  log = await since(() => page.getByRole('button', { name: '왼쪽 방향키' }).click());
  check('방향키 버튼', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xff51], [0, 0xff51]]));
  log = await since(() => page.getByRole('button', { name: 'Esc' }).click());
  check('Esc 버튼', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xff1b], [0, 0xff1b]]));
  log = await since(async () => { await page.getByRole('button', { name: /^Control 키/ }).click(); await page.getByRole('button', { name: /^Shift 키/ }).click(); await page.keyboard.type('x'); });
  check('Ctrl+Shift 칩 + x: 두 보조키가 x 를 감싸고 곧바로 해제', JSON.stringify(keys(log)) === JSON.stringify([[1, 0xffe3], [1, 0xffe1], [1, 0x78], [0, 0x78], [0, 0xffe1], [0, 0xffe3]]), JSON.stringify(keys(log)));
  log = await since(async () => { await page.getByRole('button', { name: /^Command 키/ }).click(); await page.getByRole('button', { name: /^Command 키/ }).click(); await page.keyboard.type('a'); await page.keyboard.type('b'); });
  check('Cmd 칩 두 번 탭(고정): 연속 두 글자에 모두 적용', keys(log).filter(k => k[0] === 1 && k[1] === 0xffe7).length === 2, JSON.stringify(keys(log)));
  await page.getByRole('button', { name: /^Command 키/ }).click();
  await tools(page); await page.getByRole('button', { name: '키보드', exact: true }).click(); await sleep(200);

  // 도구 자동 숨김 후 다시 열기
  await sleep(4600);
  check('가만히 두면 도구 줄이 자동으로 숨음', await page.locator('.remote-chrome').count() === 0);
  await page.getByRole('button', { name: '도구 열기' }).click(); await sleep(150);
  check('핸들로 도구 줄 다시 열림', await page.locator('.remote-chrome').count() === 1);

  // 지연 표시
  const shown = await page.waitForFunction(() => /\d+ms/.test(document.querySelector('.remote-status-pill')?.textContent ?? ''), null, { timeout: 12000 }).then(() => true, () => false);
  check('지연 시간 표시(연결됨 · N ms)', shown, await page.locator('.remote-status-pill').textContent());

  // 직접 터치: 탭한 점을 그대로 클릭
  await tools(page); await page.getByRole('button', { name: /^손가락 조작 방식 바꾸기/ }).click(); await sleep(200);
  s = await state(page);
  const tx = 150, ty = 420;
  log = await since(() => t.tap(tx, ty));
  p = pointers(log);
  const ex = Math.round((tx - s.x) / s.scale), ey = Math.round((ty - s.y) / s.scale);
  check('직접 터치: 탭한 위치의 데스크톱 좌표를 정확히 클릭', p[0]?.mask === 1 && Math.abs(p[0].x - ex) <= 2 && Math.abs(p[0].y - ey) <= 2, `got ${p[0]?.x},${p[0]?.y} want ${ex},${ey}`);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ttakkari.remote-desktop.settings.v1')));
  check('설정(직접 터치)이 localStorage 에 저장됨', stored.mode === 'touch');
  await tools(page); await page.getByRole('button', { name: '설정' }).click(); await sleep(250);
  await page.screenshot({ path: join(out, 'chromium-portrait-settings.png') });
  await page.getByRole('button', { name: '설정 닫기' }).click();

  // 뒤로가기 방지
  await page.evaluate(() => history.back()); await sleep(500);
  check('시스템 뒤로가기(스와이프)가 세션을 끊지 않고 안내만 표시', await page.locator('.remote-session').count() === 1 && (await page.locator('.remote-guidance', { hasText: '✕' }).count()) > 0);

  await context.close();

  // 가로 화면
  const land = await open(browser, { ...devices['iPhone 14 landscape'] }, 'chromium-landscape');
  const ls = await state(land.page);
  check('가로: 전체 맞춤 배율이 높이 기준으로 계산됨', Math.abs(ls.scale - 390 / 1080) < .02 || Math.abs(ls.scale - (await land.page.evaluate(() => innerHeight)) / 1080) < .02, `scale=${ls.scale.toFixed(3)}`);
  await tools(land.page); await land.page.getByRole('button', { name: '게임패드' }).click(); await sleep(250);
  await land.page.screenshot({ path: join(out, 'chromium-landscape-pad.png') });
  await tools(land.page); await land.page.getByRole('button', { name: '키보드', exact: true }).click(); await sleep(250);
  await land.page.screenshot({ path: join(out, 'chromium-landscape-keyboard.png') });
  await land.context.close();
}

async function webkitSuite(browser) {
  const { context, page } = await open(browser, devices['iPhone 14'], 'webkit');
  let s = await state(page);
  check('WebKit: 연결 직후 전체 맞춤', Math.abs(s.scale - 390 / 1920) < .01, `scale=${s.scale.toFixed(3)}`);
  await page.screenshot({ path: join(out, 'webkit-portrait-fit.png') });
  const log = await since(() => page.touchscreen.tap(200, 500));
  check('WebKit: 실제 터치 탭이 좌클릭(누름→뗌)으로 전송', pointers(log).map(e => e.mask).join() === '1,0', pointers(log).map(e => e.mask).join());
  // 합성 포인터 끌기
  const drag = await since(() => page.evaluate(async () => {
    const el = document.querySelector('.remote-input');
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    fire('pointerdown', 100, 500);
    for (let i = 1; i <= 10; i++) { fire('pointermove', 100 + i * 12, 500); await new Promise(r => setTimeout(r, 16)); }
    fire('pointerup', 220, 500);
  }));
  const p = pointers(drag);
  check('WebKit: 끌기가 상대 이동(마스크 0)', p.length > 3 && p.at(-1).x > p[0].x + 100 && p.every(e => e.mask === 0), `x ${p[0]?.x}→${p.at(-1)?.x}`);
  await tools(page); await page.getByRole('button', { name: '게임패드' }).click(); await sleep(200);
  await page.screenshot({ path: join(out, 'webkit-portrait-pad.png') });
  await tools(page); await page.getByRole('button', { name: '키보드', exact: true }).click(); await sleep(250);
  await page.screenshot({ path: join(out, 'webkit-portrait-keyboard.png') });
  const typed = await since(() => page.keyboard.type('hi'));
  check('WebKit: 입력칸 타이핑 전송', JSON.stringify(keys(typed)) === JSON.stringify([[1, 104], [0, 104], [1, 105], [0, 105]]), JSON.stringify(keys(typed)));
  const kor = await since(() => page.keyboard.insertText('글'));
  check('WebKit: 한글 글자 전송', JSON.stringify(keys(kor)) === JSON.stringify([[1, 0x100ae00], [0, 0x100ae00]]), JSON.stringify(keys(kor)));
  await tools(page); await page.getByRole('button', { name: '키보드', exact: true }).click();
  await tools(page); await page.getByRole('button', { name: '설정' }).click(); await sleep(250);
  await page.screenshot({ path: join(out, 'webkit-portrait-settings.png') });
  await context.close();
  const land = await open(browser, devices['iPhone 14 landscape'], 'webkit-landscape');
  await tools(land.page); await land.page.getByRole('button', { name: '게임패드' }).click(); await sleep(250);
  await land.page.screenshot({ path: join(out, 'webkit-landscape-pad.png') });
  await tools(land.page); await land.page.getByRole('button', { name: '키보드', exact: true }).click(); await sleep(250);
  await land.page.screenshot({ path: join(out, 'webkit-landscape-keyboard.png') });
  await land.context.close();
}

const launcher = which === 'webkit' ? webkit : chromium;
const browser = await launcher.launch();
try { await (which === 'webkit' ? webkitSuite : chromiumSuite)(browser); } finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과${failed.length ? `, 실패: ${failed.map(f => f.name).join(' | ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
