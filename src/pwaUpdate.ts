const CHECK_MS = 30 * 60_000;

/**
 * 서비스워커 등록 + 새 버전 찾기. iOS 홈 화면 앱은 앱을 닫지 않으면 페이지를 다시 읽지 않아 옛 번들로 계속 돈다.
 * 그래서 앞으로 돌아올 때와 30분마다 업데이트를 확인하고, 새 서비스워커가 제어권을 잡으면(sw 가 skipWaiting·clientsClaim) 페이지를 한 번 다시 읽는다.
 * updateViaCache: "none" 은 Cloudflare 가 sw.js·가져온 스크립트에 붙이는 4시간 브라우저 캐시를 건너뛰게 한다.
 */
export function setupPwaUpdate(): void {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // 첫 설치(제어하는 워커가 아직 없음)에는 다시 읽을 필요가 없다.
  const hadController = sw.controller !== null;
  let reloading = false;
  sw.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
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
