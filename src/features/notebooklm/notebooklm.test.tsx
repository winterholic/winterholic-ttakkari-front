import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { ApiError } from "../../api/client";
import { AuthStatusCard } from "./AuthStatusCard";
import { ErrorNotice } from "./ErrorNotice";
import { splitAnswer } from "./citations";
import { describeError, jobStatusText } from "./labels";
import { OFF_REASON, QUERY_RESULT, authStatus, job } from "./fixtures";
import { QueryPanel } from "./QueryPanel";
import { NOTEBOOK } from "./fixtures";

const h = vi.hoisted(() => ({
  login: vi.fn(), cancel: vi.fn(), verify: vi.fn(), resume: vi.fn(), query: vi.fn(), toast: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  startNotebookLMLogin: h.login,
  cancelNotebookLMLogin: h.cancel,
  verifyNotebookLM: h.verify,
  resumeNotebookLM: h.resume,
  queryNotebook: h.query,
}));
vi.mock("../../ui/toastStore", () => ({ toast: h.toast }));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
);
const apiError = (status: number, code: string, message: string, extra: { retryAfter?: number; outcome_unknown?: boolean } = {}) =>
  new ApiError(status, { code, message, outcome_unknown: extra.outcome_unknown }, extra.retryAfter);

it("login_required 를 사람이 읽을 문장으로 보여 주고 로그인 창이 Mac Studio 화면에 뜬다고 알린다", () => {
  wrap(<AuthStatusCard status={authStatus()} />);
  expect(screen.getByText("로그인 필요")).toBeTruthy();
  expect(screen.getByText(/Mac Studio 화면에 전용 Chrome 창이 떠요/)).toBeTruthy();
  expect(screen.getByText(/폰이 아니라/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /로그인 창 열기/ })).toBeTruthy();
});

it("세션이 암호화되지 않음을 숨기지 않고, 지원 안 하는 기능을 이유와 함께 보여 준다", () => {
  wrap(<AuthStatusCard status={authStatus()} />);
  expect(screen.getByText("파일 권한으로 보호, 암호화 안 함")).toBeTruthy();
  const off = screen.getAllByText("지원 안 함");
  expect(off).toHaveLength(5);
  expect(screen.getAllByText(OFF_REASON)).toHaveLength(5);
  expect(screen.getByText("오디오 개요")).toBeTruthy();
  expect(screen.getByText("웹 URL 소스")).toBeTruthy();
});

it("metrics 는 접힌 영역이다", () => {
  wrap(<AuthStatusCard status={authStatus({ metrics: { counters: { "jobs.started": 2 }, latency: {}, scope: "process" } })} />);
  const d = screen.getByText("사용 지표·제한").closest("details") as HTMLDetailsElement;
  expect(d.open).toBe(false);
});

it("로그인 창이 열려 있으면 취소 버튼만 있고 로그인 시작 버튼은 없다", async () => {
  h.cancel.mockResolvedValue({});
  wrap(<AuthStatusCard status={authStatus({ login: { state: "waiting", message: null, active: true, started_at: null, finished_at: null } })} />);
  expect(screen.queryByRole("button", { name: /로그인 창 열기/ })).toBeNull();
  expect(screen.getByText(/Mac Studio 화면의 Chrome 창에서 Google 로그인/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /로그인 취소/ }));
  await waitFor(() => expect(h.cancel).toHaveBeenCalledTimes(1));
});

it("로그인 시작 버튼은 누를 때만 로그인 창을 요청한다", async () => {
  h.login.mockResolvedValue({ state: "starting", active: true });
  wrap(<AuthStatusCard status={authStatus()} />);
  expect(h.login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /로그인 창 열기/ }));
  await waitFor(() => expect(h.login).toHaveBeenCalledTimes(1));
});

it("Chrome 이 없으면 로그인 버튼을 막고 이유를 말한다", () => {
  wrap(<AuthStatusCard status={authStatus({ browser_available: false })} />);
  expect((screen.getByRole("button", { name: /로그인 창 열기/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Chrome을 찾지 못해/)).toBeTruthy();
});

it("cooldown 은 남은 시간을 보여 준다", () => {
  const until = new Date(Date.now() + 125_000).toISOString();
  wrap(<AuthStatusCard status={authStatus({ state: "cooldown", cooldown_until: until, retry_after: 125 })} />);
  expect(screen.getByText("사용 제한 대기")).toBeTruthy();
  expect(screen.getByRole("timer").textContent).toMatch(/남은 시간\s*2분/);
});

it("reauth_required 는 다시 로그인을 안내한다", () => {
  wrap(<AuthStatusCard status={authStatus({ state: "reauth_required" })} />);
  expect(screen.getByText("다시 로그인 필요")).toBeTruthy();
  expect(screen.getByText(/만료됐거나 거부됐어요/)).toBeTruthy();
});

it("session_saved 는 접속 확인 버튼을 준다", async () => {
  h.verify.mockResolvedValue(authStatus({ state: "ready" }));
  wrap(<AuthStatusCard status={authStatus({ state: "session_saved", session: { stored: true, cookie_names: ["SID", "HSID"], permissions_ok: true, encrypted: false, protection: "p" } })} />);
  expect(screen.getByText(/쿠키 2개 저장\(이름만/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /접속 확인/ }));
  await waitFor(() => expect(h.verify).toHaveBeenCalledTimes(1));
});

it("blocked 는 직접 확인하라는 안내를 거친 뒤에만 resume 한다", async () => {
  h.resume.mockResolvedValue(authStatus({ state: "session_saved" }));
  wrap(<AuthStatusCard status={authStatus({ state: "blocked" })} />);
  expect(screen.getByText("보안 확인 필요")).toBeTruthy();
  // 로그인 버튼은 막힌 동안 보이지 않는다
  expect(screen.queryByRole("button", { name: /로그인 창 열기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /확인했어요, 재개/ }));
  expect(h.resume).not.toHaveBeenCalled();
  const dlg = screen.getByRole("dialog", { name: "보안 확인 뒤 재개할까요?" });
  expect(within(dlg).getByText(/직접 열어 마친 뒤/)).toBeTruthy();
  fireEvent.click(within(dlg).getByRole("button", { name: "재개" }));
  await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
});

it("disabled 는 켤 수 없다고 말하고 버튼이 없다", () => {
  wrap(<AuthStatusCard status={authStatus({ state: "disabled" })} />);
  expect(screen.getByText(/이 화면에서는 켤 수 없어요/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /로그인/ })).toBeNull();
});

it("오류를 종류별로 나눈다", () => {
  expect(describeError(apiError(429, "rate_limited", "x", { retryAfter: 30 }))).toMatchObject({ kind: "cooldown", retryAfter: 30 });
  expect(describeError(apiError(409, "auth_required", "x")).kind).toBe("auth");
  expect(describeError(apiError(423, "protection_signal", "x")).kind).toBe("blocked");
  expect(describeError(apiError(504, "timeout", "x", { outcome_unknown: true })).kind).toBe("unknown_outcome");
  expect(describeError(new TypeError("Failed to fetch")).kind).toBe("network");
  expect(describeError(apiError(413, "too_large", "파일이 너무 큽니다.")).kind).toBe("too_large");
});

it("ErrorNotice: 쿨다운은 남은 시간과 막힌 재시도, 네트워크는 연결 문구", () => {
  const onRetry = vi.fn();
  const { rerender } = wrap(<ErrorNotice error={apiError(429, "cooldown", "x", { retryAfter: 90 })} onRetry={onRetry} />);
  expect(screen.getByText("Google 사용 제한 중이에요")).toBeTruthy();
  expect(screen.getByText(/1분/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "다시 시도" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ErrorNotice error={new TypeError("x")} /></MemoryRouter></QueryClientProvider>);
});

it("job 상태 문장: unknown 은 목록 확인을, 처리 지연은 note 를 보여 준다", () => {
  expect(jobStatusText(job({ status: "unknown" })).text).toMatch(/소스 목록부터 확인/);
  expect(jobStatusText(job({ status: "succeeded", result: { ready: false, note: "아직 처리 중" } })).text).toBe("아직 처리 중");
  expect(jobStatusText(job({ status: "succeeded", result: { ready: true } })).text).toBe("등록 완료");
});

it("답변 속 인용 마커는 인용 목록에 있는 번호만 나눈다", () => {
  const parts = splitAnswer("가[1] 나[1, 2] 다[9]", QUERY_RESULT.citations);
  expect(parts.filter((p) => p.type === "cite").map((p) => p.type === "cite" && p.numbers)).toEqual([[1], [1, 2]]);
  expect(parts.some((p) => p.type === "text" && p.text.includes("[9]"))).toBe(true);
});

it("질의: 분석과 인용을 나눠 보이고, 마커를 누르면 출처와 인용 원문을 연다", async () => {
  h.query.mockResolvedValue(QUERY_RESULT);
  wrap(<QueryPanel notebook={NOTEBOOK} active />);
  fireEvent.change(screen.getByLabelText("질문"), { target: { value: "핵심 주장은?" } });
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
  await screen.findByTestId("answer");
  expect(h.query).toHaveBeenCalledWith("nb1", { question: "핵심 주장은?", conversation_id: null, source_ids: null });
  expect(screen.getByRole("region", { name: "NotebookLM 분석" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "인용과 출처" })).toBeTruthy();

  fireEvent.click(screen.getAllByRole("button", { name: "인용 1번 보기" })[0]);
  const dlg = await screen.findByRole("dialog", { name: "인용 [1]" });
  expect(within(dlg).getByText("Attention Is All You Need")).toBeTruthy();
  expect(within(dlg).getByText(/We propose a new simple network architecture/)).toBeTruthy();
  expect(within(dlg).getByText(/120–190/)).toBeTruthy();
});

it("인용 값이 null 이면 '원문 위치 정보 없음'으로 쓰고 꾸며내지 않는다", async () => {
  h.query.mockResolvedValue(QUERY_RESULT);
  wrap(<QueryPanel notebook={NOTEBOOK} active />);
  fireEvent.change(screen.getByLabelText("질문"), { target: { value: "q" } });
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
  await screen.findByTestId("answer");
  fireEvent.click(screen.getAllByRole("button", { name: "인용 2번 보기" })[0]);
  const dlg = await screen.findByRole("dialog", { name: "인용 [2]" });
  expect(within(dlg).getByText("원문 위치 정보 없음")).toBeTruthy();
  expect(within(dlg).getByText("인용 원문 텍스트 없음")).toBeTruthy();
});

it("질의 오류: 결과 불명이면 같은 질문을 다시 보내기 전에 알린다", async () => {
  h.query.mockRejectedValue(apiError(504, "timeout", "시간 초과", { outcome_unknown: true }));
  wrap(<QueryPanel notebook={NOTEBOOK} active />);
  fireEvent.change(screen.getByLabelText("질문"), { target: { value: "q" } });
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
  expect(await screen.findByText("요청이 Google에 닿았는지 알 수 없어요")).toBeTruthy();
  expect(screen.getByRole("button", { name: "이 질문 다시 보내기" })).toBeTruthy();
});
