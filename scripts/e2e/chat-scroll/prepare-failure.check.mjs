// 준비 실패 주입 검사: 브라우저를 띄우지 않는다. 대체 playwright 의 launch 가 던지게 해서
// mock·Vite 서버가 실제로 떴다가 실패 뒤 모두 닫히고(포트 반환) 로드 실패가 서버 기동 전에 끝나는지 본다.
//   node scripts/e2e/chat-scroll/prepare-failure.check.mjs
import net from 'node:net';
import { runScenarios } from './chat-scroll.e2e.mjs';
import { loadPlaywright } from './runtime.mjs';

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const canListen = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
});

const vitePort = await freePort();
const mockPort = await freePort();
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); if (!ok) failed++; };

// 1. 브라우저 launch 실패: 서버는 떴다가(launch 시점에 포트 점유 확인) 실패 뒤 모두 닫혀야 한다.
let heldDuringLaunch = null;
const playwright = {
  devices: {},
  chromium: {
    launch: async () => {
      heldDuringLaunch = { vite: !(await canListen(vitePort)), mock: !(await canListen(mockPort)) };
      throw new Error('injected launch failure (Mach IPC denied)');
    },
  },
  webkit: { launch: async () => { throw new Error('unused'); } },
};
let error = null;
try {
  await runScenarios({ browserName: 'chromium', playwright, vitePort, mockPort });
} catch (e) {
  error = e;
}
check('launch 실패가 그대로 올라온다', error?.message.includes('injected launch failure'), error?.message);
check('launch 시점에 mock·Vite 가 실제로 떠 있었다', heldDuringLaunch?.vite === true && heldDuringLaunch?.mock === true, JSON.stringify(heldDuringLaunch));
check('실패 뒤 Vite 포트가 반환됐다', await canListen(vitePort), `port ${vitePort}`);
check('실패 뒤 mock 포트가 반환됐다', await canListen(mockPort), `port ${mockPort}`);

// 2. playwright-core 를 못 찾으면 서버를 띄우기 전에 설정 안내와 함께 실패한다.
let loadError = null;
try {
  await loadPlaywright({ PLAYWRIGHT_CORE: '/nonexistent/playwright-core/index.mjs' });
} catch (e) {
  loadError = e;
}
check('playwright-core 경로 오류는 PLAYWRIGHT_CORE 안내와 함께 실패한다', /PLAYWRIGHT_CORE/.test(loadError?.message ?? ''), loadError?.message.slice(0, 80));

// 3. 이미 쓰는 포트(strictPort)로 Vite 가 못 뜨는 실패에서도 mock 이 닫힌다.
const blocker = net.createServer();
const busyPort = await new Promise((resolve) => blocker.listen(0, '127.0.0.1', () => resolve(blocker.address().port)));
const mockPort2 = await freePort();
let viteError = null;
try {
  await runScenarios({ browserName: 'chromium', playwright, vitePort: busyPort, mockPort: mockPort2 });
} catch (e) {
  viteError = e;
}
blocker.close();
check('Vite 기동 실패도 올라온다', !!viteError && !/injected launch failure/.test(viteError.message), viteError?.message.slice(0, 80));
check('Vite 기동 실패 뒤 mock 포트가 반환됐다', await canListen(mockPort2), `port ${mockPort2}`);

process.exit(failed ? 1 : 0);
