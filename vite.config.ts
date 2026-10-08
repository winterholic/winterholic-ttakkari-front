import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Winterholic Ttakkari",
        short_name: "Ttakkari",
        display: "standalone",
        start_url: "/",
        // TODO: 아이콘(192/512, maskable) 은 디자인 시스템 확정 후 추가한다.
        icons: [],
      },
      workbox: {
        // API 는 인증·실시간 데이터라 서비스워커가 절대 캐시하지 않는다.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/") || url.port === "8787",
            handler: "NetworkOnly",
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
