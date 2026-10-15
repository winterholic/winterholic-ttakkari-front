/* global self, URL */
// Web Push 수신·알림 클릭. vite-plugin-pwa 가 만드는 SW 가 importScripts 로 불러온다.
// payload: { title, body, url, tag } (백엔드 push/service.py). 민감한 내용은 서버가 넣지 않는다.
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Ttakkari";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/brand/app-icon-512.png",
      badge: "/brand/app-icon-512.png",
      data: { url: data.url || "/chat" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/chat", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((c) => new URL(c.url).origin === self.location.origin);
      if (win) {
        try {
          // 활성화 전에 목적지를 전달한다. focus() 실패로 알림 경로가 사라지지 않게 한다.
          const destination = win.url === target ? win : await win.navigate(target);
          if (destination) {
            await destination.focus();
            return;
          }
        } catch {
          // navigate 가 막히면(비제어 클라이언트 등) 새 창으로 넘어간다.
        }
      }
      const opened = await self.clients.openWindow(target);
      // 홈 화면 PWA가 start_url의 창을 반환한 경우에도 알림 목적지를 유지한다.
      if (opened && opened.url !== target) await opened.navigate(target);
    })(),
  );
});
