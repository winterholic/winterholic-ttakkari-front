import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { TossInvestPage } from "./TossInvestPage";

const h = vi.hoisted(() => ({
  status: vi.fn(), runs: vi.fn(), help: vi.fn(), check: vi.fn(), sync: vi.fn(),
}));
vi.mock("../api/client", () => ({
  getTossInvestStatus: h.status,
  listTossInvestRuns: h.runs,
  getTossInvestLoginHelp: h.help,
  checkTossInvest: h.check,
  syncTossInvest: h.sync,
  ApiError: class extends Error { status = 500; code = "error"; },
}));
vi.mock("../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../hooks/useForegroundResync", () => ({ useForegroundResync: () => {} }));
vi.mock("../ui/toastStore", () => ({ toast: vi.fn() }));

const STATUS = {
  state: "login_required", message: "로그인이 필요합니다.", logged_in: false,
  checked_at: "2026-10-18T09:00:00Z", browser_available: true, profile_exists: false,
  check_interval_seconds: 300, last_run: null,
};
const HELP = {
  profile_dir: "/tmp/toss-chrome", profile_exists: false, cookie_hosts: [],
  steps: ["일반 Chrome 창으로 토스증권을 엽니다.", "로그인합니다."],
  open_command: ["open", "-na", "Google Chrome"],
  note: "비밀번호를 따까리에 저장하지 않습니다.",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.status.mockResolvedValue(STATUS);
  h.runs.mockResolvedValue([]);
  h.help.mockResolvedValue(HELP);
  h.check.mockResolvedValue({ id: "r1", kind: "check", status: "login_required" });
  h.sync.mockResolvedValue({ id: "r2", kind: "sync", status: "ready" });
});
afterEach(cleanup);

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/stocks/tossinvest"]}>
      <Routes><Route path="/stocks/tossinvest" element={<TossInvestPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

it("연결 상태와 로그인 안내·작업 기록을 보여준다", async () => {
  mount();
  expect(await screen.findByText("로그인 필요")).toBeTruthy();
  expect(screen.getByText("로그인이 필요합니다.")).toBeTruthy();
  expect(await screen.findByText("최초 1회 로그인")).toBeTruthy();
  expect(screen.getByText("일반 Chrome 창으로 토스증권을 엽니다.")).toBeTruthy();
  expect(await screen.findByText("아직 확인·동기화 기록이 없어요.")).toBeTruthy();
});

it("연결 확인 버튼이 API를 부른다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "연결 확인" }));
  await waitFor(() => expect(h.check).toHaveBeenCalledTimes(1));
});

it("동기화 버튼이 API를 부른다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "동기화" }));
  await waitFor(() => expect(h.sync).toHaveBeenCalledTimes(1));
});

it("작업 기록 목록을 보여준다", async () => {
  h.runs.mockResolvedValue([{
    id: "r9", kind: "sync", status: "ready", message: "저장된 로그인으로 토스증권을 열었습니다.",
    logged_in: true, page_title: "토스증권", api_paths: ["api.tossinvest.com/v1/x"],
    duration_ms: 3200, request_source: "manual",
    created_at: "2026-10-18T09:00:00Z", updated_at: "2026-10-18T09:00:05Z",
  }]);
  mount();
  expect(await screen.findByText("동기화 · 연결됨")).toBeTruthy();
  expect(screen.getByText("저장된 로그인으로 토스증권을 열었습니다.")).toBeTruthy();
});
