import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QwenWorkerSection } from "./QwenWorkerSection";

const api = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("../../api/client", () => ({ qwenWorkerStatus: api.get, setQwenWorker: api.set }));

beforeEach(() => {
  api.get.mockResolvedValue({ enabled: false, config_locked: false, ready: false, reason: "disabled" });
  api.set.mockResolvedValue({ enabled: true, config_locked: false, ready: true, reason: "ready" });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function show() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <QwenWorkerSection />
  </QueryClientProvider>);
}

it("owner enables only on deliberate toggle and sees the confirmed state", async () => {
  show();
  const toggle = await screen.findByRole("switch", { name: "Qwen 작업자 사용" });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  expect(api.set).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(api.set).toHaveBeenCalledWith(true));
  await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true));
  expect(screen.getByRole("status").textContent).toContain("준비됨");
});

it("operator policy stays locked", async () => {
  api.get.mockResolvedValue({ enabled: false, config_locked: true, ready: false, reason: "disabled" });
  show();
  const toggle = await screen.findByRole("switch", { name: "Qwen 작업자 사용" });
  expect((toggle as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(/운영 설정에 고정/)).toBeTruthy();
  expect(api.set).not.toHaveBeenCalled();
});

it("failed readiness keeps toggle off and shows an actionable error", async () => {
  api.set.mockRejectedValue(new Error("Qwen 준비 검사를 통과하지 못했습니다."));
  show();
  const toggle = await screen.findByRole("switch", { name: "Qwen 작업자 사용" });
  fireEvent.click(toggle);
  expect((await screen.findByRole("alert")).textContent).toContain("준비 검사");
  expect((toggle as HTMLInputElement).checked).toBe(false);
});

it("status lookup errors can be retried", async () => {
  api.get.mockRejectedValueOnce(new Error("연결 실패"));
  show();
  await screen.findByRole("alert");
  fireEvent.click(await screen.findByRole("button", { name: "다시 확인" }));
  await screen.findByRole("switch", { name: "Qwen 작업자 사용" });
});
