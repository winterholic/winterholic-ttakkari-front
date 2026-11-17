import type { ComponentType } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ subscriptionState: vi.fn(), subscriptionToggle: vi.fn(), subscriptionAction: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
const state = { provider: "codex", auto_enabled: true, reset_at: 2000000000,
  next_activation_at: 2000000010, next_check_at: 1999990000, last_checked_at: 1999980000,
  last_check_outcome: "observed", last_result: null };

beforeEach(() => {
  api.subscriptionState.mockResolvedValue(state);
  api.subscriptionToggle.mockImplementation(async (_id, enabled) => ({ ...state, auto_enabled: enabled }));
  api.subscriptionAction.mockResolvedValue({ ...state, action_result: { status: "already_used" } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function renderRow(enabled = true, active = true) {
  const files = import.meta.glob<{ SubscriptionRow: ComponentType<{
    accountId: string; accountName: string; accountEnabled: boolean; active?: boolean; onUpdated: () => void;
  }> }>("./SubscriptionRow.tsx");
  expect(files["./SubscriptionRow.tsx"], "subscription controls are not implemented").toBeDefined();
  const { SubscriptionRow } = await files["./SubscriptionRow.tsx"]();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onUpdated = vi.fn();
  render(<QueryClientProvider client={qc}><SubscriptionRow accountId="cx" accountName="내 Codex"
    accountEnabled={enabled} active={active} onUpdated={onUpdated} /></QueryClientProvider>);
  return onUpdated;
}

it("shows reset, exact reservation, observation and result without a provider query", async () => {
  await renderRow();
  expect(await screen.findByText("자동 활성화 확인")).toBeTruthy();
  expect(screen.getByText("주간 초기화 예상")).toBeTruthy();
  expect(screen.getByText("마지막 상태 확인")).toBeTruthy();
  expect(screen.getByText("아직 실행 기록이 없어요.")).toBeTruthy();
  expect(api.subscriptionAction).not.toHaveBeenCalled();
});

it("persists the switch and separates manual refresh from manual activation", async () => {
  const onUpdated = await renderRow();
  const toggle = await screen.findByRole("switch", { name: "내 Codex 주간 자동 활성화" });
  fireEvent.click(toggle);
  await waitFor(() => expect(api.subscriptionToggle).toHaveBeenCalledWith("cx", false));
  fireEvent.click(screen.getByRole("button", { name: "상태 확인" }));
  await waitFor(() => expect(api.subscriptionAction).toHaveBeenCalledWith("cx", "refresh"));
  await waitFor(() => expect(screen.getByRole("button", { name: "지금 활성화" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "지금 활성화" }));
  await waitFor(() => expect(api.subscriptionAction).toHaveBeenCalledWith("cx", "activate"));
  expect(onUpdated).toHaveBeenCalled();
  expect(await screen.findByText("이미 사용한 주기라 요청을 생략했어요.")).toBeTruthy();
});

it("blocks changes and requests for an account that is off", async () => {
  await renderRow(false);
  expect((await screen.findByRole("switch")).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "지금 활성화" }).hasAttribute("disabled")).toBe(true);
});

it("shows a retry when metadata cannot be read", async () => {
  api.subscriptionState.mockRejectedValue(new Error("offline"));
  await renderRow();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "예약 정보 다시 읽기" })).toBeTruthy();
  expect(api.subscriptionAction).not.toHaveBeenCalled();
});

it("never describes an uncertain dispatch as success", async () => {
  api.subscriptionState.mockResolvedValue({ ...state, last_result: { status: "unknown" } });
  await renderRow();
  expect(await screen.findByText("실행 결과를 확인하지 못했어요. 중복 요청을 막고 있어요.")).toBeTruthy();
  expect(screen.queryByText("활성화 요청을 마쳤어요.")).toBeNull();
});

it("does not fetch or poll metadata while the usage dialog is closed", async () => {
  await renderRow(true, false);
  expect(screen.getByText("주간 자동 활성화")).toBeTruthy();
  expect(api.subscriptionState).not.toHaveBeenCalled();
});
