import { isTextEntry } from "./shell/useKeyboardOpen";

const CHECK_MS = 30 * 60_000;
const RETRY_MS = 5_000;
// 청크 오류로 다시 읽은 직후 또 실패하면(새 배포도 아직 반쯤 올라간 경우 등) 끝없이 다시 읽지 않는다.
const STALE_RELOAD_KEY = "tk-stale-reload-at";
const STALE_RELOAD_GUARD_MS = 15_000;

/** 지금 다시 읽으면 잃을 입력이 있는가: 글자 입력 칸에 포커스, 내용이 있는 입력 칸, 컴포저에 붙은 첨부(data-has-context). */
export function hasUnsavedInput(): boolean {
  if (isTextEntry(document.activeElement)) return true;
  if (document.querySelector(".tk-composer[data-has-context]")) return true;
  return [...document.querySelectorAll("textarea, input")].some(
    (el) => isTextEntry(el) && (el as HTMLInputElement | HTMLTextAreaElement).value.trim() !== "",
  );
}

/**
 * 배포가 바뀌어 이 페이지가 아는 lazy 청크가 서버에서 사라진 오류인가.
 * Vercel 은 없는 경로에 index.html(200 text/html)을 주므로 브라우저마다 MIME·가져오기 오류로 나타난다.
 */
export function isStaleChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /not a valid JavaScript MIME type|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

// ---- 새 버전 상태: 화면(UpdateToast)이 구독한다 ----
let updateReady = false;
const listeners = new Set<() => void>();
export const isUpdateReady = (): boolean => updateReady;
export function subscribeUpdate(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let reloading = false;
let retryTimer = 0;
const defaultReload = () => window.location.reload();
let reloadPage: () => void = defaultReload;

function markUpdateReady(): void {
  if (updateReady) return;
  updateReady = true;
  listeners.forEach((l) => l());
}

/** 사용자가 "지금 적용"을 눌렀을 때. 초안이 있어도 다시 읽는다. */
export function applyUpdate(): void {
  reloading = true;
  window.clearInterval(retryTimer);
  reloadPage();
}

function tryReload(): void {
  if (!updateReady || reloading || hasUnsavedInput()) return;
  applyUpdate();
}

function startRetry(): void {
  tryReload();
  if (!reloading && !retryTimer) retryTimer = window.setInterval(tryReload, RETRY_MS);
}

/**
 * lazy 청크를 못 받았을 때(vite:preloadError). 화면은 에러 바운더리가 잡고, 여기서는 새 버전으로 다시 읽는다.
 * 방금 같은 이유로 다시 읽었으면 반복하지 않고 안내만 남긴다.
 */
export function onStaleChunk(now = Date.now()): void {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(STALE_RELOAD_KEY)) || 0;
  } catch {
    // 저장소를 못 쓰면 반복 방지 없이 한 번만 시도한다(아래 reloading 이 막는다).
  }
  markUpdateReady();
  if (now - last < STALE_RELOAD_GUARD_MS) return;
  try {
    sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    // 위와 같다.
  }
  startRetry();
}

/**
 * 서비스워커 등록 + 새 버전 찾기. iOS 홈 화면 앱은 앱을 닫지 않으면 페이지를 다시 읽지 않아 옛 번들로 계속 돈다.
 * 그래서 앞으로 돌아올 때와 30분마다 업데이트를 확인하고, 새 서비스워커가 제어권을 잡으면(sw 가 skipWaiting·clientsClaim) 페이지를 다시 읽는다.
 * 다만 입력 중인 초안이 날아가면 안 되므로 hasUnsavedInput() 이 참인 동안은 미루고 "새 버전" 안내를 띄운다.
 * 입력 칸이 비었거나 포커스가 빠졌을 때, 앱이 백그라운드로 갔다 돌아올 때, 5초마다 다시 시도한다.
 * 옛 번들이 이미 사라진 lazy 청크를 부르면(배포 직후) 같은 경로로 다시 읽는다.
 * updateViaCache: "none" 은 Cloudflare 가 sw.js·가져온 스크립트에 붙이는 4시간 브라우저 캐시를 건너뛰게 한다.
 */
export function setupPwaUpdate(): void {
  window.addEventListener("vite:preloadError", () => onStaleChunk());
  // 포커스가 빠진 직후에는 activeElement 가 아직 body 가 아닐 수 있어 한 박자 늦춘다.
  document.addEventListener("focusout", () => window.setTimeout(tryReload, 300));
  document.addEventListener("input", tryReload);
  document.addEventListener("visibilitychange", tryReload);

  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // 첫 설치(제어하는 워커가 아직 없음)에는 다시 읽을 필요가 없다.
  const hadController = sw.controller !== null;
  sw.addEventListener("controllerchange", () => {
    if (!hadController || updateReady) return;
    markUpdateReady();
    startRetry();
  });

  const start = () => {
    void sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
      const check = () => void reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.setInterval(check, CHECK_MS);
    });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/** 테스트용: 모듈 상태를 처음으로 돌린다. jsdom 의 location.reload 는 바꿔 끼울 수 없어 대신 받는다. */
export function resetUpdateStateForTest(reload: () => void = defaultReload): void {
  reloadPage = reload;
  updateReady = false;
  reloading = false;
  window.clearInterval(retryTimer);
  retryTimer = 0;
  listeners.clear();
}
