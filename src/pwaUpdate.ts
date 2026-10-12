import { isTextEntry } from "./shell/useKeyboardOpen";

const CHECK_MS = 30 * 60_000;
const RETRY_MS = 5_000;

/** 지금 다시 읽으면 잃을 입력이 있는가: 글자 입력 칸에 포커스, 내용이 있는 입력 칸, 컴포저에 붙은 첨부(data-has-context). */
export function hasUnsavedInput(): boolean {
  if (isTextEntry(document.activeElement)) return true;
  if (document.querySelector(".tk-composer[data-has-context]")) return true;
  return [...document.querySelectorAll("textarea, input")].some(
    (el) => isTextEntry(el) && (el as HTMLInputElement | HTMLTextAreaElement).value.trim() !== "",
  );
}

/**
 * 서비스워커 등록 + 새 버전 찾기. iOS 홈 화면 앱은 앱을 닫지 않으면 페이지를 다시 읽지 않아 옛 번들로 계속 돈다.
 * 그래서 앞으로 돌아올 때와 30분마다 업데이트를 확인하고, 새 서비스워커가 제어권을 잡으면(sw 가 skipWaiting·clientsClaim) 페이지를 다시 읽는다.
 * 다만 입력 중인 초안이 날아가면 안 되므로 hasUnsavedInput() 이 참인 동안은 미루고,
 * 입력 칸이 비었거나 포커스가 빠졌을 때, 앱이 백그라운드로 갔다 돌아올 때, 5초마다 다시 시도한다.
 * updateViaCache: "none" 은 Cloudflare 가 sw.js·가져온 스크립트에 붙이는 4시간 브라우저 캐시를 건너뛰게 한다.
 */
export function setupPwaUpdate(): void {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // 첫 설치(제어하는 워커가 아직 없음)에는 다시 읽을 필요가 없다.
  const hadController = sw.controller !== null;
  let pending = false;
  let reloading = false;
  let retryTimer = 0;

  const tryReload = () => {
    if (!pending || reloading || hasUnsavedInput()) return;
    reloading = true;
    window.clearInterval(retryTimer);
    window.location.reload();
  };

  sw.addEventListener("controllerchange", () => {
    if (!hadController || pending) return;
    pending = true;
    tryReload();
    if (!reloading) retryTimer = window.setInterval(tryReload, RETRY_MS);
  });
  // 포커스가 빠진 직후에는 activeElement 가 아직 body 가 아닐 수 있어 한 박자 늦춘다.
  document.addEventListener("focusout", () => window.setTimeout(tryReload, 300));
  document.addEventListener("input", tryReload);
  document.addEventListener("visibilitychange", tryReload);

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
