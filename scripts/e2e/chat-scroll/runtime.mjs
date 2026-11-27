// chat-scroll E2E 공용 실행 준비. 포트·playwright-core 경로를 환경에서 받고, 준비 단계가 어디서 실패해도 만든 서버를 모두 닫는다.
import { pathToFileURL } from 'node:url';

/** 포트: CHAT_SCROLL_VITE_PORT / CHAT_SCROLL_MOCK_PORT (기본 5899 / 5898). */
export function e2ePorts(env = process.env) {
  const num = (name, fallback) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${name} 은(는) 0~65535 정수여야 합니다: ${env[name]}`);
    return n;
  };
  return { vitePort: num('CHAT_SCROLL_VITE_PORT', 5899), mockPort: num('CHAT_SCROLL_MOCK_PORT', 5898) };
}

/**
 * playwright-core 로드. PLAYWRIGHT_CORE 는 playwright-core/index.mjs 파일 경로이고,
 * 없으면 이 저장소에서 풀리는 'playwright-core' 를 쓴다. 서버를 띄우기 전에 불러서 없으면 바로 실패한다.
 */
export async function loadPlaywright(env = process.env) {
  const target = env.PLAYWRIGHT_CORE ? pathToFileURL(env.PLAYWRIGHT_CORE).href : 'playwright-core';
  try {
    return await import(target);
  } catch (e) {
    throw new Error(`playwright-core 를 불러오지 못했습니다(${env.PLAYWRIGHT_CORE ?? "'playwright-core' 패키지"}). PLAYWRIGHT_CORE=<경로>/playwright-core/index.mjs 로 지정하세요. 원인: ${e.message}`, { cause: e });
  }
}

/** 만든 순서의 역순으로 닫는 자원 묶음. 하나가 닫기에 실패해도 나머지는 닫고, 닫기 오류는 로그만 남긴다. */
export function createResources() {
  const closers = [];
  return {
    add(resource, close) {
      closers.push(() => close(resource));
      return resource;
    },
    async closeAll() {
      while (closers.length) {
        const close = closers.pop();
        try {
          await close();
        } catch (e) {
          console.error(`[cleanup] 닫기 실패(계속 진행): ${e.message}`);
        }
      }
    },
  };
}
