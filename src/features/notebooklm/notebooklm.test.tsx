import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { ApiError } from "../../api/client";
import type { NlmJob } from "../../api/notebooklmTypes";
import { AuthStatusCard } from "./AuthStatusCard";
import { ErrorNotice } from "./ErrorNotice";
import { splitAnswer } from "./citations";
import { describeError, jobErrorToApiError, jobStatusText, jobTarget } from "./labels";
import { OFF_REASON, QUERY_RESULT, authStatus, job } from "./fixtures";
import { QueryPanel } from "./QueryPanel";
import { NOTEBOOK } from "./fixtures";

const h = vi.hoisted(() => ({
  login: vi.fn(), complete: vi.fn(), cancel: vi.fn(), verify: vi.fn(), resume: vi.fn(),
  start: vi.fn(), query: vi.fn(), getJob: vi.fn(), cancelJob: vi.fn(), toast: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  startNotebookLMLogin: h.login,
  completeNotebookLMLogin: h.complete,
  cancelNotebookLMLogin: h.cancel,
  verifyNotebookLM: h.verify,
  resumeNotebookLM: h.resume,
  startNotebookQuery: h.start,
  queryNotebook: h.query,
  cancelNotebookJob: h.cancelJob,
  getNotebookJob: h.getJob,
}));
vi.mock("../../ui/toastStore", () => ({ toast: h.toast }));

beforeEach(() => {
  vi.clearAllMocks();
  h.getJob.mockImplementation(() => new Promise(() => {}));
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
);

/** QueryPanel 렌더. jobs 목록이 바뀌는 상황을 rerender 로 재현한다. */
const renderQuery = (jobs: NlmJob[] | undefined) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter><QueryPanel notebook={NOTEBOOK} jobs={jobs} active /></MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    ...view,
    setJobs: (next: NlmJob[] | undefined) => view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter><QueryPanel notebook={NOTEBOOK} jobs={next} active /></MemoryRouter>
      </QueryClientProvider>,
    ),
  };
};

const queryJob = (over: Partial<NlmJob> = {}): NlmJob => job({
  id: "jq1", kind: "query", notebook_id: "nb1", status: "running",
  params: { question_preview: "핵심 주장은?" }, result: null,
  ...over,
});

const askQuestion = (q: string) => {
  fireEvent.change(screen.getByLabelText("질문"), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
};
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

it("로그인 창이 열려 있으면 완료·취소 버튼이 있고 로그인 시작 버튼은 없다", async () => {
  h.cancel.mockResolvedValue({});
  h.complete.mockResolvedValue({});
  wrap(<AuthStatusCard status={authStatus({ login: { state: "waiting", message: null, active: true, started_at: null, finished_at: null } })} />);
  expect(screen.queryByRole("button", { name: /로그인 창 열기/ })).toBeNull();
  expect(screen.getByText(/Mac Studio 화면의 Chrome 창에서 Google 로그인/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /로그인 완료/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /로그인 취소/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /로그인 완료/ }));
  await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));
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

it("429 라도 우리 쪽 최소 간격(too_soon)은 Google 사용 제한으로 표시하지 않는다", () => {
  const d = describeError(apiError(429, "too_soon", "확인은 30초에 한 번만 할 수 있습니다.", { retryAfter: 12 }));
  expect(d).toMatchObject({ kind: "too_soon", retryAfter: 12 });
  expect(d.title).not.toMatch(/Google 사용 제한/);
});

it("upstream_error·integration_error 는 원인 요약을 함께 낸다", () => {
  const up = new ApiError(502, { code: "upstream_error", message: "NotebookLM 처리 중 오류", detail: "NotebookLMError: boom" });
  expect(describeError(up)).toMatchObject({ kind: "upstream", cause: "NotebookLMError: boom" });
  const it2 = new ApiError(500, { code: "integration_error", message: "연동 코드 오류", detail: "TypeError: cannot be combined" });
  expect(describeError(it2)).toMatchObject({ kind: "integration", cause: "TypeError: cannot be combined" });
});

it("상태 카드는 마지막 실패의 원인 요약을 보여 준다", () => {
  wrap(<AuthStatusCard status={authStatus({
    state: "session_saved",
    last_error_code: "integration_error",
    last_error: { code: "integration_error", message: "연동 코드 오류", detail: "TypeError: x", at: "2026-10-19T13:00:00+00:00" },
  })} />);
  expect(screen.getByTestId("nlm-last-error").textContent).toMatch(/TypeError: x/);
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

it("질의: job 으로 시작하고 끝나면 분석과 인용을 나눠 보인다", async () => {
  h.start.mockResolvedValue({ job: queryJob() });
  const view = renderQuery([]);
  askQuestion("핵심 주장은?");
  await waitFor(() => expect(h.start).toHaveBeenCalledWith("nb1", { question: "핵심 주장은?", conversation_id: null, source_ids: null }));
  expect(screen.getByText(/답을 만드는 중/)).toBeTruthy();
  view.setJobs([queryJob({ status: "succeeded", result: { query: QUERY_RESULT }, finished_at: "2026-10-19T02:01:00Z" })]);
  await screen.findByTestId("answer");
  expect(screen.getByRole("region", { name: "NotebookLM 분석" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "인용과 출처" })).toBeTruthy();

  fireEvent.click(screen.getAllByRole("button", { name: "인용 1번 보기" })[0]);
  const dlg = await screen.findByRole("dialog", { name: "인용 [1]" });
  expect(within(dlg).getByText("Attention Is All You Need")).toBeTruthy();
  expect(within(dlg).getByText(/We propose a new simple network architecture/)).toBeTruthy();
  expect(within(dlg).getByText(/120–190/)).toBeTruthy();
});

it("인용 값이 null 이면 '원문 위치 정보 없음'으로 쓰고 꾸며내지 않는다", async () => {
  h.start.mockResolvedValue({ job: queryJob() });
  const view = renderQuery([]);
  askQuestion("q");
  await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
  view.setJobs([queryJob({ status: "succeeded", result: { query: QUERY_RESULT } })]);
  await screen.findByTestId("answer");
  fireEvent.click(screen.getAllByRole("button", { name: "인용 2번 보기" })[0]);
  const dlg = await screen.findByRole("dialog", { name: "인용 [2]" });
  expect(within(dlg).getByText("원문 위치 정보 없음")).toBeTruthy();
  expect(within(dlg).getByText("인용 원문 텍스트 없음")).toBeTruthy();
});

it("질의 시작 오류: 결과 불명이면 같은 질문을 다시 보내기 전에 알린다", async () => {
  h.start.mockRejectedValue(apiError(504, "timeout", "시간 초과", { outcome_unknown: true }));
  renderQuery([]);
  askQuestion("q");
  expect(await screen.findByText("요청이 Google에 닿았는지 알 수 없어요")).toBeTruthy();
  expect(screen.getByRole("button", { name: "이 질문 다시 보내기" })).toBeTruthy();
});

it("질의 job 실패: 끝난 뒤에도 다시 보내기를 준다", async () => {
  h.start.mockResolvedValue({ job: queryJob() });
  const view = renderQuery([]);
  askQuestion("q");
  await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
  view.setJobs([queryJob({ status: "failed", error_code: "upstream_error", error: "NotebookLM이 요청을 처리하지 못했어요." })]);
  expect(await screen.findByText("NotebookLM이 요청을 처리하지 못했어요.")).toBeTruthy();
  const retry = screen.getByRole("button", { name: "이 질문 다시 보내기" });
  h.start.mockResolvedValue({ job: queryJob({ id: "jq2" }) });
  fireEvent.click(retry);
  await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
});

it("진행 중 질의는 명시적 취소 버튼으로만 취소하고, 화면을 나가도 취소하지 않는다", async () => {
  localStorage.setItem("ttakkari:nlm:turns:nb1", JSON.stringify({
    turns: [{ question: "핵심 주장은?", jobId: "jq1", result: null }],
    conversationId: null,
  }));
  h.cancelJob.mockResolvedValue(queryJob({ status: "cancelled" }));
  const view = renderQuery([queryJob()]);
  expect(await screen.findByText(/답을 만드는 중/)).toBeTruthy();
  view.unmount();
  expect(h.cancelJob).not.toHaveBeenCalled();

  const view2 = renderQuery([queryJob()]);
  expect(await screen.findByText(/답을 만드는 중/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "이 질문 취소" }));
  await waitFor(() => expect(h.cancelJob).toHaveBeenCalledWith("jq1"));
  view2.unmount();
});

it("돌아오면 저장된 답변은 바로 보이고 진행 중 job 은 목록으로 복구한다", async () => {
  localStorage.setItem("ttakkari:nlm:turns:nb1", JSON.stringify({
    turns: [
      { question: "먼저 한 질문", jobId: "jq0", result: QUERY_RESULT },
      { question: "핵심 주장은?", jobId: "jq1", result: null },
    ],
    conversationId: "c1",
  }));
  const view = renderQuery([queryJob()]);
  expect(await screen.findByText("먼저 한 질문")).toBeTruthy();
  expect(screen.getAllByTestId("answer")).toHaveLength(1);
  expect(screen.getByText(/답을 만드는 중/)).toBeTruthy();
  view.setJobs([queryJob({ status: "succeeded", result: { query: QUERY_RESULT } })]);
  await waitFor(() => expect(screen.getAllByTestId("answer")).toHaveLength(2));
});

it("단건 조회도 404인 복원 job 만 다시 질문을 안내한다", async () => {
  h.getJob.mockRejectedValue(apiError(404, "not_found", "작업 없음"));
  localStorage.setItem("ttakkari:nlm:turns:nb1", JSON.stringify({
    turns: [{ question: "오래된 질문", jobId: "jq-old", result: null }],
    conversationId: null,
  }));
  renderQuery([]);
  expect(await screen.findByText("이 질의의 진행 정보를 찾지 못했어요. 다시 질문해 주세요.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "이 질문 다시 보내기" })).toBeTruthy();
});

it("구 백엔드(/queries 없음)에서는 동기 질의로 받아 바로 보인다", async () => {
  h.start.mockRejectedValue(new ApiError(404, { code: "http_404", message: "Not Found" }));
  h.query.mockResolvedValue(QUERY_RESULT);
  renderQuery([]);
  askQuestion("핵심 주장은?");
  await screen.findByTestId("answer");
  expect(h.query).toHaveBeenCalledWith("nb1", { question: "핵심 주장은?", conversation_id: null, source_ids: null });
  // 노트북 자체가 없는 404 는 폴백하지 않는다.
  h.start.mockRejectedValue(apiError(404, "not_found", "노트북 없음"));
  askQuestion("q2");
  expect(await screen.findByText("노트북 없음")).toBeTruthy();
  expect(h.query).toHaveBeenCalledTimes(1);
});

it("질의 job 문장: 소스 등록 문장과 섞지 않는다", () => {
  expect(jobTarget(queryJob())).toBe("핵심 주장은?");
  expect(jobStatusText(queryJob({ status: "running" })).text).toMatch(/답을 만드는 중/);
  expect(jobStatusText(queryJob({ status: "succeeded", result: { query: QUERY_RESULT } })).text).toBe("답변 완료");
  expect(jobStatusText(queryJob({ status: "cancelled" })).text).toBe("취소했어요.");
  expect(jobStatusText(queryJob({ status: "unknown", error: null })).text).toMatch(/다시 질문하기 전에/);
  const err = jobErrorToApiError(queryJob({ status: "unknown", error_code: "timeout", error: "시간 초과", result: { outcome_unknown: true } }));
  expect(err).toMatchObject({ status: 504, code: "timeout", outcomeUnknown: true });
  expect(describeError(err).kind).toBe("unknown_outcome");
});


it("다른 노트북 작업 20개에 밀려도 저장한 ID로 답변을 복구한다", async () => {
  localStorage.setItem("ttakkari:nlm:turns:nb1", JSON.stringify({
    turns: [{ question: "오래된 질문", jobId: "jq-old", result: null }], conversationId: null,
  }));
  h.getJob.mockResolvedValue(queryJob({ id: "jq-old", status: "succeeded", result: { query: QUERY_RESULT } }));
  renderQuery(Array.from({ length: 20 }, (_, i) => queryJob({ id: `other-${i}`, notebook_id: "nb2" })));
  await screen.findByTestId("answer");
  expect(h.getJob).toHaveBeenCalledWith("jq-old");
  expect(h.start).not.toHaveBeenCalled();
});

it("단건 조회의 일시적인 통신 실패는 없는 작업으로 처리하지 않는다", async () => {
  localStorage.setItem("ttakkari:nlm:turns:nb1", JSON.stringify({
    turns: [{ question: "긴 분석", jobId: "jq-old", result: null }], conversationId: null,
  }));
  h.getJob.mockRejectedValue(new TypeError("network"));
  renderQuery([]);
  await waitFor(() => expect(h.getJob).toHaveBeenCalledWith("jq-old"));
  expect(screen.queryByRole("button", { name: "이 질문 다시 보내기" })).toBeNull();
  h.getJob.mockResolvedValue(queryJob({ id: "jq-old", status: "succeeded", result: { query: QUERY_RESULT } }));
  fireEvent.click(await screen.findByRole("button", { name: "진행 상태 다시 읽기" }));
  await screen.findByTestId("answer");
});

it("시작 응답 전에 화면을 나가도 응답의 job ID를 저장해 복구한다", async () => {
  let finish!: (value: { job: NlmJob }) => void;
  h.start.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const first = renderQuery([]);
  askQuestion("긴 분석");
  await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
  first.unmount();
  finish({ job: queryJob() });
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem("ttakkari:nlm:turns:nb1")!).turns[0].jobId).toBe("jq1");
  });
  h.getJob.mockResolvedValue(queryJob({ status: "succeeded", result: { query: QUERY_RESULT } }));
  renderQuery([]);
  await screen.findByTestId("answer");
});

it("브라우저 저장이 거부되면 복원 제한을 사용자에게 알린다", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  try {
    renderQuery([]);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "warning", message: expect.stringMatching(/저장하지 못/) }));
  } finally {
    spy.mockRestore();
  }
});

it("오래된 완료 노트북 캐시는 정리하고 진행 중 질문은 남긴다", () => {
  for (let i = 0; i < 30; i++) {
    localStorage.setItem(`ttakkari:nlm:turns:old-${i}`, JSON.stringify({
      updatedAt: i, turns: [{ question: "완료", jobId: `done-${i}`, result: QUERY_RESULT }], conversationId: null,
    }));
  }
  localStorage.setItem("ttakkari:nlm:turns:pending", JSON.stringify({
    updatedAt: 0, turns: [{ question: "진행", jobId: "pending", result: null }], conversationId: null,
  }));
  localStorage.setItem("unrelated", "keep");
  renderQuery([]);
  const keys = Object.keys(localStorage).filter((key) => key.startsWith("ttakkari:nlm:turns:"));
  expect(keys.length).toBeLessThanOrEqual(21); // 완료 캐시 20개 + 진행 중 캐시는 보존
  expect(localStorage.getItem("ttakkari:nlm:turns:pending")).not.toBeNull();
  expect(localStorage.getItem("unrelated")).toBe("keep");
});


it("목록 밖 진행 중 job 은 개별 폴링으로 완료 답변까지 받는다", async () => {
  localStorage.setItem("ttakkari:nlm:turns:nb1", JSON.stringify({
    turns: [{ question: "긴 분석", jobId: "jq-old", result: null }], conversationId: null,
  }));
  h.getJob.mockResolvedValueOnce(queryJob({ id: "jq-old" })).mockResolvedValue(
    queryJob({ id: "jq-old", status: "succeeded", result: { query: QUERY_RESULT } }),
  );
  renderQuery([]);
  await screen.findByRole("button", { name: "이 질문 취소" });
  await screen.findByTestId("answer", {}, { timeout: 4000 });
  expect(h.getJob).toHaveBeenCalledTimes(2);
  expect(h.start).not.toHaveBeenCalled();
});


it("완료 캐시의 개수가 적어도 전체 문자 예산을 넘기면 오래된 기록부터 정리한다", () => {
  for (let i = 0; i < 4; i++) {
    localStorage.setItem(`ttakkari:nlm:turns:large-${i}`, JSON.stringify({
      updatedAt: i, turns: [{ question: "완료", jobId: `done-${i}`, result: { ...QUERY_RESULT, answer: "가".repeat(350000) } }],
    }));
  }
  renderQuery([]);
  const size = Object.keys(localStorage).filter((key) => key.startsWith("ttakkari:nlm:turns:")).reduce((total, key) => total + localStorage.getItem(key)!.length, 0);
  expect(size).toBeLessThanOrEqual(1_000_000);
  expect(localStorage.getItem("ttakkari:nlm:turns:large-3")).not.toBeNull();
  expect(localStorage.getItem("ttakkari:nlm:turns:large-0")).toBeNull();
});
