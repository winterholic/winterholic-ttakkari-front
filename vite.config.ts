import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pwa from "./src/vendor/ttakkari/pwa.json" with { type: "json" };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        // 이름·색·아이콘은 디자인 시스템 dist/pwa.json 이 정본이다(docs/19 §6).
        name: pwa.name,
        short_name: pwa.short_name,
        theme_color: pwa.theme_color,
        background_color: pwa.background_color,
        lang: "ko",
        display: "standalone",
        start_url: "/chat",
        icons: pwa.icons,
      },
      workbox: {
        // 푸시 수신·알림 클릭 처리는 생성되는 SW 에 이 파일을 끼워 넣어 쓴다.
        importScripts: ["/push-sw.js"],
        // 셸·CSS·아이콘은 precache. 결과물 원본은 캐시하지 않는다(민감 자료가 기기에 남는다).
        globPatterns: ["**/*.{js,css,html,svg,ico}", "brand/{app-icon-512,app-icon-maskable-512,apple-touch-icon-180}.png"],
        // 뷰어의 무거운 렌더러(Monaco 2.8MB 등)는 쓸 때만 네트워크로 받는다. precache 한도(2MiB)를 넘으면 빌드가 실패한다.
        globIgnores: ["**/CodeView-*.js", "**/PdfView-*.js", "**/SheetView-*.js"],
        // API 는 인증·실시간 데이터라 서비스워커가 절대 캐시하지 않는다.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/") || url.port === "8787",
            handler: "NetworkOnly",
          },
          {
            // Pretendard·JetBrains Mono: 오프라인에서도 글꼴이 같아야 한다(docs/19 §1).
            urlPattern: ({ url }) => url.hostname === "cdn.jsdelivr.net",
            handler: "CacheFirst",
            options: {
              cacheName: "tk-fonts",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
