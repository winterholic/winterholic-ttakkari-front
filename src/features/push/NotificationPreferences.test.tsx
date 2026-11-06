import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ getNotificationPreferences: vi.fn(), updateNotificationPreference: vi.fn() }));
vi.mock("../../api/client", () => api);
import { NotificationPreferences } from "./NotificationPreferences";

const items = [
  { kind: "push.weather", category: "weather", label: "날씨 브리핑", description: "매일 날씨를 알려드려요.", enabled: true, default_enabled: true },
  { kind: "push.calendar_reminder", category: "planner", label: "일정 알림", description: "설정한 시간에 일정을 알려드려요.", enabled: true, default_enabled: true },
  { kind: "push.agent", category: "assistant", label: "메인 에이전트의 직접 알림", description: "최종 결과와 확인 요청이에요.", enabled: true, default_enabled: true },
  { kind: "push.worker_agent", category: "tasks", label: "하위 에이전트의 직접 알림", description: "각 하위 작업의 개별 보고예요.", enabled: false, default_enabled: false },
];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NotificationPreferences /></QueryClientProvider>);
}
beforeEach(() => {
  api.getNotificationPreferences.mockReset().mockResolvedValue({ items });
  api.updateNotificationPreference.mockReset().mockImplementation(async ({ kind, enabled }) => ({ items: items.map(x => x.kind === kind ? { ...x, enabled } : x) }));
});
afterEach(cleanup);
it("유형을 따로 켜고 끄며 저장된 서버 값을 표시한다", async () => {
  mount();
  const weather = await screen.findByRole("switch", { name: "날씨 브리핑" });
  expect((weather as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("switch", { name: "하위 에이전트의 직접 알림" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(weather);
  await waitFor(() => expect(api.updateNotificationPreference).toHaveBeenCalledWith({ kind: "push.weather", enabled: false }, expect.anything()));
  await waitFor(() => expect((weather as HTMLInputElement).checked).toBe(false));
  expect((screen.getByRole("switch", { name: "일정 알림" }) as HTMLInputElement).checked).toBe(true);
});
it("저장 실패 때 기존 선택을 유지하고 재시도할 수 있다", async () => {
  api.updateNotificationPreference.mockRejectedValueOnce(new Error("offline"));
  mount();
  const weather = await screen.findByRole("switch", { name: "날씨 브리핑" });
  fireEvent.click(weather);
  expect(await screen.findByRole("alert")).toBeTruthy();
  await waitFor(() => expect((weather as HTMLInputElement).disabled).toBe(false));
  expect((weather as HTMLInputElement).checked).toBe(true);
  fireEvent.click(weather);
  await waitFor(() => expect((weather as HTMLInputElement).checked).toBe(false));
});
it("설정 조회 실패를 전체 꺼짐처럼 표시하지 않는다", async () => {
  api.getNotificationPreferences.mockRejectedValueOnce(new Error("offline"));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(await screen.findByRole("switch", { name: "날씨 브리핑" })).toBeTruthy();
});
