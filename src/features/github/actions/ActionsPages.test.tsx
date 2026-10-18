import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ACCOUNTS, JOBS, REPO, RUNS, envelope, logWindow, runItem } from "../fixtures";

const h = vi.hoisted(() => ({ ghAccounts: vi.fn(), ghRepo: vi.fn(), ghRuns: vi.fn(), ghRun: vi.fn(), ghRunJobs: vi.fn(), ghJobLogs: vi.fn() }));
vi.mock("../../../api/githubClient", async (orig) => ({
  ...(await orig<typeof import("../../../api/githubClient")>()),
  ghAccounts: (...a: unknown[]) => h.ghAccounts(...a),
  ghRepo: (...a: unknown[]) => h.ghRepo(...a),
  ghRuns: (...a: unknown[]) => h.ghRuns(...a),
  ghRun: (...a: unknown[]) => h.ghRun(...a),
  ghRunJobs: (...a: unknown[]) => h.ghRunJobs(...a),
  ghJobLogs: (...a: unknown[]) => h.ghJobLogs(...a),
}));

import { GhApiError } from "../../../api/githubClient";
import { GithubPage } from "../../../pages/GithubPage";

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes><Route path="/github/*" element={<GithubPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const where = () => screen.getByTestId("where").textContent;
const A = "alice";
const page = (more = false, n = 1) => ({ page: { page: n, per_page: 30, has_more: more, total_count: null, limit_hit: false } });
const JOB = "/github/alice/demo/actions/runs/9001/jobs/5001?as=alice";

beforeEach(() => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: ACCOUNTS, gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  h.ghRepo.mockImplementation(async () => envelope(REPO, A));
  h.ghRuns.mockImplementation(async () => envelope(RUNS, A, page()));
  h.ghRun.mockImplementation(async () => envelope(RUNS[0], A));
  h.ghRunJobs.mockImplementation(async () => envelope(JOBS, A, page()));
  h.ghJobLogs.mockImplementation(async (_a: string, _o: string, _r: string, _j: string, q: { from_line?: number; lines?: number }) => envelope(logWindow(q.from_line ?? 1, 2000), A));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("run 목록은 결과 배지와 run 상세 링크를 준다", async () => {
  renderAt("/github/alice/demo/actions?as=alice");
  const link = (await screen.findAllByRole("link", { name: /fix: 저장 버튼/ }))[0];
  expect(link.getAttribute("href")).toBe("/github/alice/demo/actions/runs/9001?as=alice");
  expect(h.ghRuns).toHaveBeenCalledWith("alice", "alice", "demo", { status: undefined, branch: undefined, page: 1 });
  const list = screen.getByRole("list", { name: "실행 목록" });
  expect(within(list).getByText("실패")).toBeTruthy();
  expect(within(list).getByText("성공")).toBeTruthy();
  expect(within(list).getByText("진행 중")).toBeTruthy();
});

it("상태·브랜치 필터는 URL 에 둔다", async () => {
  renderAt("/github/alice/demo/actions?as=alice");
  await screen.findAllByRole("link", { name: /fix: 저장 버튼/ });
  fireEvent.click(screen.getByRole("button", { name: "실패" }));
  await waitFor(() => expect(where()).toBe("/github/alice/demo/actions?as=alice&status=failure"));
  const input = screen.getByLabelText("브랜치로 거르기");
  fireEvent.change(input, { target: { value: "main" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(where()).toBe("/github/alice/demo/actions?as=alice&status=failure&branch=main"));
  await waitFor(() => expect(h.ghRuns).toHaveBeenLastCalledWith("alice", "alice", "demo", { status: "failure", branch: "main", page: 1 }));
});

it("Actions 가 없는 저장소는 빈 상태", async () => {
  h.ghRuns.mockImplementation(async () => envelope([], A, page()));
  renderAt("/github/alice/demo/actions?as=alice");
  expect(await screen.findByText(/실행 기록이 없어요/)).toBeTruthy();
});

it("run 상세는 job 목록과 step 결과를 보여 주고 실패 step 이 먼저다", async () => {
  renderAt("/github/alice/demo/actions/runs/9001?as=alice");
  const job = await screen.findByRole("link", { name: /build \(ubuntu-latest, node 22\)/ });
  expect(job.getAttribute("href")).toBe(JOB);
  expect(h.ghRun).toHaveBeenCalledWith("alice", "alice", "demo", "9001");
  expect(h.ghRunJobs).toHaveBeenCalledWith("alice", "alice", "demo", "9001", { page: 1 });
  const steps = within(screen.getByRole("list", { name: "step 결과" })).getAllByRole("listitem");
  expect(steps[0].textContent).toMatch(/Run tests/);
  expect(steps).toHaveLength(3);
});

it("run 번호가 숫자가 아니면 서버를 부르지 않는다", async () => {
  renderAt("/github/alice/demo/actions/runs/abc?as=alice");
  expect(await screen.findByText(/찾을 수 없거나 권한이 없어요/)).toBeTruthy();
  expect(h.ghRun).not.toHaveBeenCalled();
});

it("로그 창은 2,000줄 단위이고 줄번호를 실제 로그 줄 번호로 단다", async () => {
  renderAt(JOB);
  const region = await screen.findByRole("region", { name: "로그" });
  expect(h.ghJobLogs).toHaveBeenCalledWith("alice", "alice", "demo", "5001", { from_line: 1, lines: 2000 });
  expect(within(region).getAllByRole("row")).toHaveLength(2000);
  expect(screen.getByText(/5,300줄 중 1–2,000줄/)).toBeTruthy();
  expect(screen.getByText(/가려져 있어요/)).toBeTruthy();
});

it("다음 창으로 가면 from_line 이 URL 에 남아 새로고침·뒤로가기에 안전하다", async () => {
  renderAt(JOB);
  await screen.findByRole("region", { name: "로그" });
  fireEvent.click(screen.getByRole("button", { name: /다음 2,000줄/ }));
  await waitFor(() => expect(where()).toBe(JOB + "&from_line=2001"));
  await waitFor(() => expect(h.ghJobLogs).toHaveBeenLastCalledWith("alice", "alice", "demo", "5001", { from_line: 2001, lines: 2000 }));
  expect(await screen.findByText(/5,300줄 중 2,001–4,000줄/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /이전 2,000줄/ })).toBeTruthy();
});

it("마지막 창에는 다음 버튼이 없다", async () => {
  h.ghJobLogs.mockImplementation(async () => envelope(logWindow(5001, 300, 5300), A));
  renderAt(JOB + "&from_line=5001");
  await screen.findByRole("region", { name: "로그" });
  expect(screen.queryByRole("button", { name: /다음/ })).toBeNull();
});

it("각 줄 앞의 시각은 기본으로 숨기고 토글로 보인다", async () => {
  renderAt(JOB);
  const region = await screen.findByRole("region", { name: "로그" });
  expect(within(region).getAllByRole("row")[0].textContent).not.toMatch(/2026-10-17T/);
  fireEvent.click(screen.getByRole("button", { name: "시각 보기" }));
  expect(within(screen.getByRole("region", { name: "로그" })).getAllByRole("row")[0].textContent).toMatch(/2026-10-17T/);
});

it("로그를 받을 수 없으면 가짜 로그 없이 이유와 GitHub 안전 링크를 보여 준다", async () => {
  h.ghJobLogs.mockImplementation(async () => { throw new GhApiError({ status: 410, code: "gh_gone", message: "x" }); });
  renderAt(JOB);
  expect(await screen.findByText(/로그를 볼 수 없어요/)).toBeTruthy();
  expect(screen.queryByRole("region", { name: "로그" })).toBeNull();
  const links = screen.getAllByRole("link", { name: /GitHub 에서 열기/ }).map((a) => a.getAttribute("href"));
  expect(links).toContain("https://github.com/alice/demo/actions/runs/9001/job/5001");
});

it("로그 권한 부족(403)도 로그 불가 화면으로 같은 안내를 한다", async () => {
  h.ghJobLogs.mockImplementation(async () => { throw new GhApiError({ status: 403, code: "gh_forbidden", message: "x", reason: "scope_missing" }); });
  renderAt(JOB);
  expect(await screen.findByText(/로그를 볼 수 없어요/)).toBeTruthy();
  expect(screen.queryByRole("region", { name: "로그" })).toBeNull();
});

it("일시 오류는 로그 불가가 아니라 재시도 오류로 보인다", async () => {
  h.ghJobLogs.mockImplementation(async () => { throw new GhApiError({ status: 504, code: "gh_timeout", message: "x" }); });
  renderAt(JOB);
  expect(await screen.findByText(/응답이 늦어요/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  expect(screen.queryByText(/로그를 볼 수 없어요/)).toBeNull();
});

it("로그가 비어 있으면 빈 상태이지 성공 로그가 아니다", async () => {
  h.ghJobLogs.mockImplementation(async () => envelope({ lines: [], total_lines: 0, from_line: 1, masked: true, truncated: false }, A));
  renderAt(JOB);
  expect(await screen.findByText(/로그가 비어 있어요/)).toBeTruthy();
});

it("job 화면은 실패한 step 을 먼저 보여 준다", async () => {
  renderAt(JOB);
  await screen.findByRole("region", { name: "로그" });
  const stepList = screen.getByRole("list", { name: "step 결과" });
  expect(within(stepList).getAllByRole("listitem")[0].textContent).toMatch(/Run tests/);
});

it("run 이 진행 중이면 로그가 계속 늘어난다고 알린다", async () => {
  h.ghRunJobs.mockImplementation(async () => envelope([{ ...JOBS[0], status: "in_progress", conclusion: null }], A, page()));
  renderAt(JOB);
  expect(await screen.findByText(/진행 중인 job/)).toBeTruthy();
});

it("긴 줄은 가로 스크롤이 기본이고 줄바꿈 토글을 준다", async () => {
  const { container } = renderAt(JOB);
  await screen.findByRole("region", { name: "로그" });
  expect((container.querySelector(".gh-logbox") as HTMLElement).hasAttribute("data-wrap")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "줄바꿈" }));
  expect((container.querySelector(".gh-logbox") as HTMLElement).hasAttribute("data-wrap")).toBe(true);
  expect(runItem().id).toBe(9001);
});
