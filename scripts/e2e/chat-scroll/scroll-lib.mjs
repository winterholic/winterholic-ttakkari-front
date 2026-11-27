// chat-scroll E2E 헬퍼. 입력은 Playwright 의 신뢰된 입력(mouse.wheel·keyboard·click)만 쓰고,
// 메시지는 안정 ID(`author:run번호`), 위치는 .tk-thread 컨테이너 기준 픽셀로 잰다.
// 고정 sleep 대신 '스크롤이 멎음'·'진행 중 API 요청 없음' 조건을 기다린다.

/** 페이지에 심는 측정 도구. 앱 코드는 건드리지 않는다. */
export const PAGE_TOOLS = `
(() => {
  localStorage.setItem('tk-onboarded', '1');
  delete Navigator.prototype.serviceWorker; // 검증 서버에는 sw.js 가 없어 등록이 SecurityError 를 낸다(ui-sweep 과 같은 처리)
  window.__e2eMarker = Math.random().toString(36).slice(2);
  window.__tk = {
    thread: () => document.querySelector('.tk-thread'),
    info() {
      const t = this.thread();
      return { top: t.scrollTop, height: t.scrollHeight, client: t.clientHeight, gap: t.scrollHeight - t.scrollTop - t.clientHeight };
    },
    // 대화 순서대로 안정 ID. 사용자 메시지의 '질문 N:' 이 그 Run 의 번호고, 바로 뒤 에이전트 메시지는 같은 번호를 받는다.
    messages() {
      const t = this.thread(); const tr = t.getBoundingClientRect(); let run = null; const out = [];
      for (const el of t.querySelectorAll('.tk-message, .report-message')) {
        const author = el.dataset.author || 'agent';
        if (author === 'user') run = /질문\\s+(\\S+?):/.exec(el.textContent)?.[1] ?? run;
        const r = el.getBoundingClientRect();
        out.push({ id: author + ':' + run, top: r.top - tr.top, bottom: r.bottom - tr.top, height: r.height, busy: el.getAttribute('aria-busy') === 'true' });
      }
      return out;
    },
    // 사용자가 '읽는 중'이라 볼 기준 메시지: 위쪽 경계가 화면 안에서 시작하고 40px 이상 보이는 첫 메시지(없으면 40px 이상 보이는 첫 메시지).
    anchor() {
      const t = this.thread(); const ch = t.clientHeight;
      const visible = this.messages().filter((m) => Math.min(m.bottom, ch) - Math.max(m.top, 0) >= 40);
      return visible.find((m) => m.top >= 0) ?? visible[0] ?? null;
    },
    pos(id) { return this.messages().find((m) => m.id === id) ?? null; },
    // 프레임마다 기준 메시지 위치를 기록한다. rAF 직후(레이아웃·ResizeObserver 보정 전)가 아니라 그 프레임이 그려진 뒤(setTimeout)에 읽어
    // 사용자에게 실제로 보인 위치를 잰다.
    startSampler(id) {
      const s = { id, frames: [], on: true };
      const tick = () => {
        if (!s.on) return;
        requestAnimationFrame(() => setTimeout(() => {
          if (!s.on) return;
          const p = this.pos(id); const i = this.info();
          s.frames.push({ top: p ? p.top : null, scrollTop: i.top, height: i.height });
          tick();
        }, 0));
      };
      tick();
      this.sampler = s;
    },
    // 사용자가 위로 벗어난 양: 벗어나기 직전 꼭대기(peak, 스트리밍을 따라가며 커진 값)에서 가장 많이 올라간 곳(min)까지.
    // 부드러운 스크롤은 여러 scroll 이벤트로 나뉘므로 첫 이벤트만 보지 않는다.
    armDeparture() {
      const t = this.thread(); const d = { peak: t.scrollTop, min: t.scrollTop, departed: false, gapAtMin: 0 };
      t.addEventListener('scroll', () => {
        const top = t.scrollTop;
        if (!d.departed && top >= d.peak) d.peak = top;
        else if (top < d.min || !d.departed) { d.departed = true; if (top < d.min || d.min === d.peak) { d.min = Math.min(d.min, top); d.gapAtMin = t.scrollHeight - top - t.clientHeight; } }
      });
      this.dep = d;
    },
    stopSampler() {
      const s = this.sampler; s.on = false;
      const tops = s.frames.map((f) => f.top).filter((v) => v !== null);
      const heights = s.frames.map((f) => f.height);
      return { frames: s.frames.length, lost: s.frames.length - tops.length, minTop: Math.min(...tops), maxTop: Math.max(...tops), heightMin: Math.min(...heights), heightMax: Math.max(...heights) };
    },
    // scrollTop 이 연속 4프레임 같으면 멎은 것
    settle: () => new Promise((resolve) => {
      let last = -1; let stable = 0;
      const f = () => { const t = document.querySelector('.tk-thread').scrollTop; if (t === last) stable++; else { stable = 0; last = t; } stable >= 4 ? resolve(t) : requestAnimationFrame(f); };
      f();
    }),
  };
})();
`;

/** 페이지의 /api 요청을 기록한다(SSE stream 제외). 진행 중 요청 수와 Run 별 events 요청을 알려 준다. */
export function trackRequests(page) {
  const log = { events: [], runs: [], tree: [], inflight: 0, responded: [] };
  const isApi = (u) => /\/api\//.test(u) && !/\/stream(\?|$)/.test(u);
  page.on('request', (req) => {
    const u = req.url();
    if (!isApi(u)) return;
    log.inflight++;
    let m;
    if ((m = /\/api\/runs\/([^/]+)\/events/.exec(u))) log.events.push(m[1]);
    else if (/\/api\/sessions\/[^/]+\/runs/.test(u)) log.runs.push(u.replace(/^.*\/api\//, ''));
    else if (/\/api\/tasks\/[^/]+\/tree/.test(u)) log.tree.push(u.replace(/^.*\/api\/tasks\//, ''));
  });
  const done = (req) => {
    const u = req.url();
    if (!isApi(u)) return;
    log.inflight = Math.max(0, log.inflight - 1);
    const m = /\/api\/runs\/([^/]+)\/events/.exec(u);
    if (m) log.responded.push(m[1]);
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return log;
}

export function makeDriver(page, log, { vw, vh, canWheel = true }) {
  const thread = () => page.locator('.tk-thread');
  const info = () => page.evaluate(() => window.__tk.info());
  /** 이번 프레임이 그려진 뒤의 info. 스트리밍이 자라는 중에는 레이아웃 직후·ResizeObserver 보정 전의 일시적인 어긋남을 피한다. */
  const painted = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    return info();
  };
  const anchor = () => page.evaluate(() => window.__tk.anchor());
  const pos = (id) => page.evaluate((i) => window.__tk.pos(i), id);
  const settle = () => page.evaluate(() => window.__tk.settle());
  const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' });

  /**
   * 진행 중 API 요청이 없고(고정 sleep 아님) 스크롤이 멎을 때까지. 스트리밍을 따라가는 중이면 scrollTop 이 계속 변하므로 scroll:false.
   */
  async function quiesce({ timeout = 8000, scroll = true } = {}) {
    const start = Date.now();
    let calm = 0;
    while (calm < 3) {
      if (Date.now() - start > timeout) throw new Error(`quiesce timeout (inflight=${log.inflight})`);
      if (scroll) await settle();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      calm = log.inflight === 0 ? calm + 1 : 0;
    }
  }

  const center = async () => {
    const b = await thread().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
  };
  /**
   * 신뢰된 마우스 휠. 음수가 위로. 휠이 안 되는 프로파일(Playwright 모바일 WebKit)에서는 키보드(Page/Home/End)로 대신하며,
   * 이 경우 입력 종류가 다르다는 것을 호출한 쪽 증거에 남긴다(driver.wheelFallback).
   */
  let keyboardReady = false;
  async function wheel(dy, { wait = true } = {}) {
    if (!canWheel) {
      driver.wheelFallback = 'keyboard';
      if (!keyboardReady) keyboardReady = await focusThread();
      if (!keyboardReady) throw Object.assign(new Error('이 프로파일에는 휠도 스레드 키보드 포커스도 없어 스크롤 입력을 줄 수 없음'), { noScrollInput: true });
      const key = Math.abs(dy) >= 10000 ? (dy < 0 ? 'Home' : 'End') : dy < 0 ? 'PageUp' : 'PageDown';
      const n = key === 'PageUp' || key === 'PageDown' ? Math.max(1, Math.round(Math.abs(dy) / (vh * 0.8))) : 1;
      for (let i = 0; i < n; i++) await page.keyboard.press(key);
      if (wait) await settle();
      return;
    }
    const c = await center();
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, dy);
    if (wait) await settle();
  }
  /**
   * 키보드 스크롤을 받게 스레드 안의 컨트롤로 포커스를 옮긴다: 입력창을 누르고 Shift+Tab 으로 거슬러 올라간다(사용자가 Tab 으로 하는 방식).
   * 스레드 자체는 포커스를 받지 못해(클릭하면 <main> 이 포커스를 가져가 PageUp·Home 이 스레드를 움직이지 못한다) 이 경로가 유일하다.
   * 포커스를 못 옮기는 엔진이면 false 를 돌려주고 호출한 쪽이 키보드 단계를 '미실행'으로 남긴다.
   */
  async function focusThread() {
    await page.locator('textarea').first().click();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      if (await page.evaluate(() => !!document.activeElement?.closest('.tk-thread'))) return true;
    }
    return false;
  }
  const press = async (key, { wait = true } = {}) => { await page.keyboard.press(key); if (wait) await settle(); };

  /** 열고, 맨 아래에서 대화가 그려지고 요청이 끝날 때까지. live 면 스트리밍 메시지가 나타나고 바닥을 따라가는지 본다. */
  async function open(url, minMessages = 10, { live = false } = {}) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('.tk-thread').waitFor({ state: 'visible', timeout: 15000 });
    await until((n) => document.querySelectorAll('.tk-thread .tk-message').length >= n, minMessages, 15000);
    if (live) await until(() => document.querySelector('.tk-message[aria-busy="true"]'), null, 15000);
    await quiesce({ timeout: 15000, scroll: !live });
    if (live) {
      await until(() => window.__tk.info().gap <= 4, null, 5000);
      const f = await followSample();
      if (!f.following) throw new Error(`열린 직후 스트리밍을 따라가지 않음: gap 표본 ${f.gaps.join(',')}`);
      return;
    }
    const i = await info();
    if (i.gap > 4) throw new Error(`열린 직후 바닥이 아님: gap=${i.gap}`);
  }
  /**
   * 입력 하나의 전후 비교. 입력 직후 사용자가 보는 기준 메시지(mid)가 로딩 응답이 끝난 뒤(after)에도 제자리인지 본다.
   * 입력 직전 기준 메시지(before)의 이동량은 입력 중 events 요청이 없던 단계에서만 엄격히 비교한다(요청이 끼면 앵커 위쪽 메시지가 자라 밀리는 게 정상).
   */
  async function inputStep(input) {
    const before = await anchor();
    const evBefore = log.events.length;
    await input();
    const evDuring = log.events.length - evBefore;
    const mid = await anchor();
    const prev = await pos(before.id);
    await quiesce();
    const after = mid ? await pos(mid.id) : null;
    return { before, mid, prev, after, evDuring, moved: prev ? prev.top - before.top : null, info: await info() };
  }
  /**
   * 프레임이 그려진 뒤 gap 을 n번 읽는다. 바닥을 따라가는 중에도 성장 직후·ResizeObserver 보정 전의 프레임을 읽으면 gap 이 성장 한 틱(약 40px)만큼 나온다.
   * 그래서 '따라가는 중'은 gap 이 0 으로 되돌아오고(≥2회) 최대치가 성장 서너 틱(130px) 안이라는 것으로 본다.
   * 따라가지 않으면 gap 이 성장만큼 계속 늘기만 한다.
   */
  async function followSample(n = 9) {
    const gaps = [];
    for (let i = 0; i < n; i++) gaps.push((await painted()).gap);
    const max = Math.max(...gaps);
    return { gaps, max, following: gaps.filter((g) => g <= 4).length >= 2 && max <= 130 };
  }
  const driver = { followSample, painted, inputStep, thread, info, anchor, pos, settle, until, quiesce, wheel, focusThread, press, open, center, vw, vh };
  return driver;
}

/** 같은 메시지가 같은 컨테이너 위치(±tol px)에 있는가. */
export function samePlace(a, b, tol = 2) {
  return !!a && !!b && a.id === b.id && Math.abs(a.top - b.top) <= tol;
}
export const fmt = (m) => (m ? `${m.id}@${m.top.toFixed(1)}` : 'null');
