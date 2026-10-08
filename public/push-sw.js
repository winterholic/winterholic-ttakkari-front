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
          const focused = await win.focus();
          if (focused && focused.url !== target) await focused.navigate(target);
          return;
        } catch {
          // navigate 가 막히면(비제어 클라이언트 등) 새 창으로 넘어간다.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
