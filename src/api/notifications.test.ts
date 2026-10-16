import { afterEach, expect, it, vi } from "vitest";
import * as api from "./client";

afterEach(() => { vi.unstubAllGlobals(); api.setAccessToken(null); });

it("알림 필터와 페이지 커서·읽음 범위를 인증된 API로 전달한다", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response("{}", { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  api.setAccessToken("notification-test-token");
  expect(api.listNotifications).toBeTypeOf("function");
  await api.listNotifications({ category: "meetings", unread_only: true, before: 42 });
  let [url, init] = fetcher.mock.calls[0];
  expect(new URL(url).searchParams.get("category")).toBe("meetings");
  expect(new URL(url).searchParams.get("before")).toBe("42");
  expect(init.headers.Authorization).toBe("Bearer notification-test-token");
  await api.readAllNotifications({ category: "meetings", through_id: 42 });
  [url, init] = fetcher.mock.calls[1];
  expect(url).toMatch(/\/api\/notifications\/read-all$/);
  expect(JSON.parse(init.body)).toEqual({ category: "meetings", through_id: 42 });
  await api.readNotification(31);
  [url, init] = fetcher.mock.calls[2];
  expect(url).toMatch(/\/api\/notifications\/31\/read$/);
  expect(init.method).toBe("PATCH");
});
