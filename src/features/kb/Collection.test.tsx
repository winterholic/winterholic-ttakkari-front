import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({ sources: vi.fn(), jobs: vi.fn(), run: vi.fn(), update: vi.fn() }));
vi.mock("../../api/collector", () => ({
  collectSources: mocks.sources, collectJobs: mocks.jobs, runCollectSource: mocks.run,
  updateCollectSource: mocks.update, createCollectSource: vi.fn(), collectItems: vi.fn(), retryCollectJob: vi.fn(),
}));
import { Collection } from "./Collection";

afterEach(() => { cleanup(); vi.resetAllMocks(); });
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><Collection /></MemoryRouter></QueryClientProvider>);
}
it("출처가 없으면 등록 동작을 안내한다", async () => {
  mocks.sources.mockResolvedValue({ items: [], runtime_enabled: true, daily_page_cap: 500 });
  mocks.jobs.mockResolvedValue({ jobs: [], next_cursor: null });
  mount();
  expect(await screen.findByText("아직 수집 출처가 없어요.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "출처 등록" })).toBeTruthy();
});
it("실패를 숨기지 않고 다시 시도할 수 있다", async () => {
  mocks.sources.mockRejectedValue(new Error("offline"));
  mocks.jobs.mockResolvedValue({ jobs: [], next_cursor: null });
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});
it("선택한 출처만 실행하고 중복 실행 중에는 버튼을 비활성화한다", async () => {
  mocks.sources.mockResolvedValue({ items: [{ id: "s1", title: "PostgreSQL 문서", source_key: "pg", enabled: true,
    auto_import: true, seeds: ["https://postgresql.org/docs"], interval_minutes: null, last_job_id: null,
    next_run_at: null, version: 1, scope: "personal", request: {} }], runtime_enabled: true, daily_page_cap: 500 });
  mocks.jobs.mockResolvedValue({ jobs: [], next_cursor: null });
  let done: (value: unknown) => void = () => {};
  mocks.run.mockImplementation(() => new Promise((resolve) => { done = resolve; }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "지금 수집" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledWith("s1", "personal"));
  expect(screen.getByRole("button", { name: "지금 수집" }).hasAttribute("disabled")).toBe(true);
  done({ job_id: "j1" });
  await waitFor(() => expect(screen.getByRole("button", { name: "지금 수집" }).hasAttribute("disabled")).toBe(false));
});
