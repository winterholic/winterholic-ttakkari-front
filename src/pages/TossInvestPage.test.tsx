import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { TossInvestPage } from "./TossInvestPage";
import { ApiError } from "../api/client";

const h = vi.hoisted(() => ({
  status: vi.fn(), runs: vi.fn(), help: vi.fn(), check: vi.fn(), sync: vi.fn(), openWindow: vi.fn(), toast: vi.fn(),
}));
vi.mock("../api/client", () => ({
  getTossInvestStatus: h.status,
  listTossInvestRuns: h.runs,
  getTossInvestLoginHelp: h.help,
  checkTossInvest: h.check,
  syncTossInvest: h.sync,
  openTossInvestLoginWindow: h.openWindow,
  ApiError: class extends Error {
    status = 500;
    code = "error";
    constructor(status?: number, body?: { code?: string; message?: string }) {
      super(body?.message);
      if (status !== undefined) this.status = status;
      if (body?.code !== undefined) this.code = body.code;
    }
  },
}));
vi.mock("../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../hooks/useForegroundResync", () => ({ useForegroundResync: () => {} }));
vi.mock("../ui/toastStore", () => ({ toast: h.toast }));

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
  h.toast.mockClear();
  h.status.mockResolvedValue(STATUS);
  h.runs.mockResolvedValue([]);
  h.help.mockResolvedValue(HELP);
  h.check.mockResolvedValue({ id: "r1", kind: "check", status: "login_required" });
  h.sync.mockResolvedValue({ id: "r2", kind: "sync", status: "ready" });
  h.openWindow.mockResolvedValue({ state: "waiting", message: "로그인 창이 열렸습니다." });
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

it("로그인 창 열기 버튼이 API를 부르고 결과를 보여준다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "토스증권 로그인 창 열기" }));
  await waitFor(() => expect(h.openWindow).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("로그인 창이 열렸습니다.")).toBeTruthy();
  expect(screen.getByText(/로그인 후 창을 닫으면 됩니다/)).toBeTruthy();
  expect(screen.getByText(/약 1주일 유지/)).toBeTruthy();
  expect(screen.getByText(/만료되면 다시 로그인/)).toBeTruthy();
});

it("최초 미확인 상태에서도 로그인 안내와 연결 확인 버튼을 보여준다", async () => {
  h.status.mockResolvedValue({
    ...STATUS, state: "never_checked", message: "아직 연결을 확인하지 않았습니다.", profile_exists: true,
  });
  mount();
  expect(await screen.findByText("미확인")).toBeTruthy();
  expect(screen.getByRole("button", { name: "연결 확인" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "토스증권 로그인 창 열기" })).toBeTruthy();
  expect(screen.getByText("최초 1회 로그인")).toBeTruthy();
});

it("ready 상태에서는 연결 완료와 마지막 확인 정보를 보이고 로그인 안내를 숨긴다", async () => {
  h.status.mockResolvedValue({ ...STATUS, state: "ready", message: "연결되어 있습니다.", logged_in: true, profile_exists: true });
  mount();
  expect(await screen.findByText("연결됨")).toBeTruthy();
  expect(screen.getByText("연결되어 있습니다.")).toBeTruthy();
  expect(screen.queryByText("최초 1회 로그인")).toBeNull();
});

it("error 상태의 오류 메시지를 상태 카드에 보여준다", async () => {
  h.status.mockResolvedValue({ ...STATUS, state: "error", message: "Chrome을 열지 못했습니다." });
  mount();
  expect(await screen.findByText("오류")).toBeTruthy();
  expect(screen.getByText("Chrome을 열지 못했습니다.")).toBeTruthy();
});

it("로그인 창 API 404면 배포 전 오류를 보여준다", async () => {
  h.openWindow.mockRejectedValueOnce(new ApiError(404, { code: "http_404", message: "Not Found" }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "토스증권 로그인 창 열기" }));
  expect(await screen.findByText("백엔드에 아직 로그인 창 열기 기능이 없어요. 백엔드 배포 뒤에 다시 시도해 주세요.")).toBeTruthy();
});

it("429 응답의 대기 안내를 토스트에 보여준다", async () => {
  h.check.mockRejectedValueOnce(new ApiError(429, { code: "rate_limited", message: "2분 뒤 다시 시도해 주세요." }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "연결 확인" }));
  await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ message: "2분 뒤 다시 시도해 주세요.", tone: "danger" }));
});

it("로그인 창 열기가 거절되면 서버 문구를 보여준다", async () => {
  h.openWindow.mockRejectedValueOnce(new ApiError(409, { code: "login_window_open", message: "로그인 창이 이미 열려 있습니다." }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "토스증권 로그인 창 열기" }));
  expect(await screen.findByText("로그인 창이 이미 열려 있습니다.")).toBeTruthy();
});

it("로그인 창이 열려 있으면 안내만 보여준다", async () => {
  h.status.mockResolvedValue({ ...STATUS, state: "login_window", message: "로그인 창이 열려 있습니다." });
  mount();
  expect(await screen.findByText("로그인 창이 열려 있습니다. 로그인 후 창을 닫아 주세요.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "토스증권 로그인 창 열기" })).toBeNull();
});

it("상태 조회 404면 배포 전 안내를 보여준다", async () => {
  h.status.mockRejectedValueOnce(new ApiError(404, { code: "http_404", message: "Not Found" }));
  mount();
  expect(await screen.findByText("백엔드에 아직 토스증권 연결 기능이 없어요. 백엔드 배포 뒤에 다시 열어 주세요.")).toBeTruthy();
});

it("다음 확인까지 남은 시간을 보여준다", async () => {
  const recent = new Date(Date.now() - 60_000).toISOString();
  h.status.mockResolvedValue({
    ...STATUS, state: "ready", message: "저장된 로그인으로 토스증권을 열었습니다.", logged_in: true,
    last_run: {
      id: "r9", kind: "check", status: "ready", message: "ok", logged_in: true,
      page_title: "토스증권", api_paths: [], duration_ms: 3200, request_source: "manual",
      created_at: recent, updated_at: recent,
    },
  });
  mount();
  expect(await screen.findByText("다음 확인까지")).toBeTruthy();
  expect(screen.getByText(/약 \d+초/)).toBeTruthy();
});
