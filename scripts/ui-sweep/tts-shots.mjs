// 음성 생성 화면·설정·채팅 재생 버튼 확인용 스크린샷. 실제 TTS 서버가 없으므로 이 스크립트가 /api/tts/* 를 가로채 합성 응답(1초짜리 사인파 WAV)을 준다.
// 사용: PLAYWRIGHT_CORE=<경로>/index.mjs node scripts/ui-sweep/tts-shots.mjs --url=http://127.0.0.1:5399 --out=/tmp/tts [--only=ready,playing] [--browser=chromium|webkit]
// --url 은 `VITE_API_BASE=<같은 주소> vite --port 5399` 같은 dev 서버다. API 는 모두 이 스크립트가 가로챈다.
/* global document, window, HTMLMediaElement */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { body as baseBody } from './stub.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const base = String(args.url ?? 'http://127.0.0.1:5399').replace(/\/$/, '');
const out = resolve(String(args.out ?? '/tmp/tts-shots'));
const only = args.only ? String(args.only).split(',') : null;
const engine = String(args.browser ?? 'chromium');
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

/** 16bit mono 22.05kHz 사인파. 브라우저가 실제로 디코드·재생하는 진짜 WAV 다. */
function wav(seconds = 1, hz = 440) {
  const rate = 22050;
  const n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 6000), 44 + i * 2);
  return buf;
}

const VOICES = [
  { id: 'ko-f1', name: '서연', lang: 'ko', gender: 'female' },
  { id: 'ko-m1', name: '민준', lang: 'ko', gender: 'male' },
  { id: 'ko-f2', name: '아주 긴 이름의 음성 프리셋 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ', lang: 'ko', gender: 'female' },
];
const READY = { enabled: true, ready: true, reason: null, engine: 'supertonic-3', model: 'supertonic-3', voice_count: VOICES.length };
const err = (status, code, message) => ({ status, json: { code, message } });
const TEXT = '오늘 회의에서 정한 일을 정리합니다. 첫째, 로컬 음성 생성 화면을 따로 만듭니다. 둘째, 채팅 응답에는 듣기 버튼을 붙이되 기본은 글자만 보이게 합니다. 셋째, 모바일 사파리에서는 한 번 누른 뒤 문장을 이어서 재생합니다.';
const DONE = {
  status: 'succeeded', progress: { done: 3, total: 3 },
  chunks: [0, 1, 2].map((i) => ({ index: i, audio_url: `/api/tts/audio/${i}`, duration: 1 })), audio_full_url: '/api/tts/audio/full',
};
const RECENT = [
  { jobId: 'r1', text: TEXT, voice: 'ko-f1', speed: 1, chunks: 3, createdAt: new Date(Date.now() - 3 * 60_000).toISOString() },
  { jobId: 'r2', text: '아주 긴 한 줄 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 이 글이 말줄임으로 잘리는지 확인합니다.', voice: 'ko-m1', speed: 1.2, chunks: 1, createdAt: new Date(Date.now() - 26 * 3600_000).toISOString() },
];
const CHAT_TEXT = '확인했어요. 로컬 음성 생성 화면과 채팅 듣기 버튼을 붙였고, 설정에서 켜기 전에는 글자만 보여요.';
const CHAT_RUN = {
  id: 'run-1', session_id: 's1', workspace_id: 'fixture', prompt: '음성 기능은 어디까지 됐어?', context_artifact_ids: [], engine: 'claude', model: null, effort: null, status: 'succeeded',
  exit_code: 0, error: null, result_text: CHAT_TEXT, cost_usd: 0.1, usage: {}, checkpoint_ref: null, origin: 'user', profile: 'claude', last_seq: 2,
  created_at: '2026-10-21T00:00:00Z', started_at: '2026-10-21T00:00:01Z', finished_at: '2026-10-21T00:00:05Z',
};
const CHAT_EVENTS = [{ seq: 1, type: 'message', payload: { text: CHAT_TEXT }, created_at: '2026-10-21T00:00:04Z' }];
const showActions = (p) => p.locator('.tk-message__actions').last().scrollIntoViewIfNeeded();
const fillAndMake = async (p, text = TEXT) => { await p.getByRole('textbox', { name: '읽을 글' }).fill(text); await p.getByRole('button', { name: '음성 만들기' }).click(); };

const SCENARIOS = {
  'tts-not-deployed': { path: '/tts', status: err(404, 'not_found', 'Not Found') },
  'tts-engine-preparing': { path: '/tts', status: { ...READY, ready: false, reason: 'model_missing' } },
  'tts-ready': { path: '/tts', status: READY },
  'tts-recent': { path: '/tts', status: READY, recent: RECENT },
  'tts-generating': { path: '/tts', status: READY, create: { job_id: 'j1', chunks: 5, cached_chunks: 1 }, job: { status: 'running', progress: { done: 2, total: 5 } }, act: (p) => fillAndMake(p) },
  'tts-playing': {
    path: '/tts', status: READY, recent: RECENT.slice(0, 1), create: { job_id: 'j1', chunks: 3, cached_chunks: 3 }, job: DONE,
    act: async (p) => { await fillAndMake(p); await p.getByRole('button', { name: '일시정지' }).waitFor(); },
  },
  'tts-paused': {
    path: '/tts', status: READY, create: { job_id: 'j1', chunks: 3, cached_chunks: 3 }, job: DONE,
    act: async (p) => { await fillAndMake(p); await p.getByRole('button', { name: '일시정지' }).click(); await p.getByRole('button', { name: '이어서 듣기' }).waitFor(); },
  },
  // 자동 재생이 막힌 iOS 를 흉내 낸다: 두 번째 play() 가 NotAllowedError 로 거절된다.
  'tts-blocked': {
    path: '/tts', status: READY, create: { job_id: 'j1', chunks: 3, cached_chunks: 3 }, job: DONE, blockSecondPlay: true,
    act: async (p) => { await fillAndMake(p); await p.getByRole('button', { name: '일시정지' }).waitFor(); await p.evaluate(() => window.__endCurrent()); await p.getByRole('button', { name: '다음 문장 듣기 (터치)' }).waitFor(); },
  },
  'tts-failed-retryable': {
    path: '/tts', status: READY, create: { job_id: 'j1', chunks: 3, cached_chunks: 0 }, job: { status: 'failed', error_code: 'owner_gone', retryable: true },
    act: async (p) => { await fillAndMake(p); await p.getByRole('alert').waitFor(); },
  },
  'tts-failed-final': {
    path: '/tts', status: READY, create: { job_id: 'j1', chunks: 3, cached_chunks: 0 }, job: { status: 'failed', error_code: 'worker_failed', retryable: false },
    act: async (p) => { await fillAndMake(p); await p.getByRole('alert').waitFor(); },
  },
  'tts-voice-menu': { path: '/tts', status: READY, act: (p) => p.getByRole('combobox').first().click().catch(() => p.locator('.tk-select__trigger').first().click()) },
  'settings-ready': { path: '/settings#tts', status: READY },
  'settings-on': { path: '/settings#tts', status: READY, prefs: { voiceOutput: true, voice: 'ko-m1', speed: 1.2 } },
  'settings-not-deployed': { path: '/settings#tts', status: err(404, 'not_found', 'Not Found') },
  'chat-off': { path: '/chat/s1', status: READY, runs: true, act: showActions },
  'chat-on': { path: '/chat/s1', status: READY, runs: true, prefs: { voiceOutput: true }, act: async (p) => { await p.getByRole('button', { name: '응답 음성으로 듣기' }).waitFor(); await showActions(p); } },
  'chat-on-not-deployed': { path: '/chat/s1', status: err(404, 'not_found', 'Not Found'), runs: true, prefs: { voiceOutput: true }, act: showActions },
  'chat-on-playing': {
    path: '/chat/s1', status: READY, runs: true, prefs: { voiceOutput: true },
    act: async (p) => { await p.getByRole('button', { name: '응답 음성으로 듣기' }).click(); await p.getByRole('button', { name: '응답 음성 일시정지' }).waitFor(); await showActions(p); },
  },
};

const profiles = [
  { name: '390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];

await mkdir(out, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? {} : { args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && !only.includes(name)) continue;
  for (const p of profiles) {
    const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.hasTouch, colorScheme: 'light' });
    await ctx.addInitScript('delete Navigator.prototype.serviceWorker');
    await ctx.addInitScript("try { localStorage.setItem('tk-onboarded', '1') } catch {}");
    if (sc.prefs) await ctx.addInitScript(`try { localStorage.setItem('tk-tts-prefs', ${JSON.stringify(JSON.stringify(sc.prefs))}) } catch {}`);
    if (sc.recent) await ctx.addInitScript(`try { localStorage.setItem('tk-tts-recent', ${JSON.stringify(JSON.stringify(sc.recent))}) } catch {}`);
    if (sc.blockSecondPlay) {
      await ctx.addInitScript(() => {
        let calls = 0;
        const real = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          calls += 1;
          window.__audio = this;
          // 1: unlock 의 무음, 2: 첫 문장, 3: 두 번째 문장(여기서 막는다)
          if (calls === 3) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
          return real.call(this);
        };
        window.__endCurrent = () => window.__audio.dispatchEvent(new Event('ended'));
      });
    }
    await ctx.route((u) => u.pathname.startsWith('/api/'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const headers = { 'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const path = url.pathname.replace(/^\/api\//, '');
      const send = (v) => (v && v.status && v.json ? route.fulfill({ status: v.status, json: v.json, headers }) : route.fulfill({ json: v, headers }));
      if (sc.runs && path === 'sessions/s1/runs') return send([CHAT_RUN]);
      if (sc.runs && path === 'runs/run-1/events') return send(CHAT_EVENTS);
      // 공용 스텁에 없는 설정 화면 응답. 빈 배열이 오면 Google 계정 섹션이 렌더링 중 멈춘다(이 변경과 무관한 기존 스텁 공백).
      if (path === 'google-accounts') return send({ accounts: [], login: null });
      if (path === 'system/qwen-worker') return send({ enabled: false, config_locked: false, ready: false, reason: 'disabled' });
      if (path === 'tts/status') return send(sc.status);
      if (path === 'tts/voices') return sc.status?.status === 404 ? send(sc.status) : send({ voices: VOICES });
      if (path === 'tts/jobs' && req.method() === 'POST') return send(sc.create ?? { job_id: 'j1', chunks: 3, cached_chunks: 0 });
      if (path.startsWith('tts/jobs/') && req.method() === 'GET') return send(sc.job ?? DONE);
      if (path.startsWith('tts/jobs/') && req.method() === 'DELETE') return send({ status: 'cancelled' });
      if (path.startsWith('tts/audio/')) return route.fulfill({ status: 200, body: wav(1, 330 + 110 * Number(path.split('/').pop()) || 440), headers: { ...headers, 'content-type': 'audio/wav' } });
      if (path === 'tts/speak') return route.fulfill({ status: 200, body: wav(2, 440), headers: { ...headers, 'content-type': 'audio/wav' } });
      return route.fulfill({ json: baseBody(path, req.method(), url.search), headers });
    });
    const page = await ctx.newPage();
    try {
      await page.goto(base + sc.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      if (sc.act) { await sc.act(page); await page.waitForTimeout(500); }
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.tk-screen__body');
        return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: el ? el.scrollWidth - el.clientWidth : 0 };
      });
      if (overflow.doc > 0 || overflow.body > 0) { failures++; console.log(`OVERFLOW ${name} ${p.name}`, overflow); }
      await page.screenshot({ path: join(out, `${name}-${p.name}.png`) });
      console.log(`ok ${name} ${p.name}`);
    } catch (e) {
      failures++;
      console.log(`FAIL ${name} ${p.name}: ${String(e).split('\n')[0]}`);
      await page.screenshot({ path: join(out, `FAIL-${name}-${p.name}.png`) }).catch(() => {});
    }
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
