import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ACCOUNTS, COMMENTS, ISSUE, ISSUES, REPO, envelope, issueItem } from "../fixtures";

const h = vi.hoisted(() => ({ ghAccounts: vi.fn(), ghRepo: vi.fn(), ghIssues: vi.fn(), ghIssue: vi.fn(), ghComments: vi.fn() }));
vi.mock("../../../api/githubClient", async (orig) => ({
  ...(await orig<typeof import("../../../api/githubClient")>()),
  ghAccounts: (...a: unknown[]) => h.ghAccounts(...a),
  ghRepo: (...a: unknown[]) => h.ghRepo(...a),
  ghIssues: (...a: unknown[]) => h.ghIssues(...a),
  ghIssue: (...a: unknown[]) => h.ghIssue(...a),
  ghComments: (...a: unknown[]) => h.ghComments(...a),
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

beforeEach(() => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: ACCOUNTS, gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  h.ghRepo.mockImplementation(async () => envelope(REPO, A));
  h.ghIssues.mockImplementation(async () => envelope(ISSUES, A, page()));
  h.ghIssue.mockImplementation(async () => envelope(ISSUE, A));
  h.ghComments.mockImplementation(async () => envelope(COMMENTS, A, page()));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("이슈 목록은 기본이 열린 이슈이고 상세 링크를 준다", async () => {
  renderAt("/github/alice/demo/issues?as=alice");
  const link = await screen.findByRole("link", { name: /저장 버튼이 눌리지 않는 문제/ });
  expect(link.getAttribute("href")).toBe("/github/alice/demo/issues/7?as=alice");
  expect(h.ghIssues).toHaveBeenCalledWith("alice", "alice", "demo", { state: "open", labels: undefined, page: 1 });
  expect(screen.getByText("해결됨")).toBeTruthy();
});

it("상태와 라벨 필터는 URL 에 두고 다시 조회한다", async () => {
  renderAt("/github/alice/demo/issues?as=alice");
  await screen.findByRole("link", { name: /저장 버튼/ });
  fireEvent.click(screen.getByRole("button", { name: "닫힘" }));
  await waitFor(() => expect(where()).toBe("/github/alice/demo/issues?as=alice&state=closed"));
  const input = screen.getByLabelText("라벨로 거르기");
  fireEvent.change(input, { target: { value: "bug" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(where()).toBe("/github/alice/demo/issues?as=alice&state=closed&labels=bug"));
  await waitFor(() => expect(h.ghIssues).toHaveBeenLastCalledWith("alice", "alice", "demo", { state: "closed", labels: "bug", page: 1 }));
});

it("이슈 개수가 아니라 has_more 로 더 보기를 판단한다(PR 을 걸러 페이지가 짧아도)", async () => {
  h.ghIssues.mockImplementation(async (_a: string, _o: string, _r: string, q: { page: number }) =>
    q.page === 1 ? envelope([issueItem({ number: 1, title: "첫 이슈" })], A, page(true, 1)) : envelope([issueItem({ number: 2, title: "둘째 이슈" })], A, page(false, 2)));
  renderAt("/github/alice/demo/issues?as=alice");
  await screen.findByText("첫 이슈");
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(await screen.findByText("둘째 이슈")).toBeTruthy();
});

it("이슈가 없으면 빈 상태", async () => {
  h.ghIssues.mockImplementation(async () => envelope([], A, page()));
  renderAt("/github/alice/demo/issues?as=alice");
  expect(await screen.findByText(/이슈가 없어요/)).toBeTruthy();
});

it("이슈가 비활성화된 저장소(410)는 안내한다", async () => {
  h.ghIssues.mockImplementation(async () => { throw new GhApiError({ status: 410, code: "gh_gone", message: "x" }); });
  renderAt("/github/alice/demo/issues?as=alice");
  expect(await screen.findByText(/더 이상 제공되지 않아요/)).toBeTruthy();
});

it("이슈 상세는 본문(이미지는 링크가 아닌 글자)과 댓글을 보여 준다", async () => {
  const { container } = renderAt("/github/alice/demo/issues/7?as=alice");
  expect(await screen.findByRole("heading", { name: /저장 버튼이 눌리지 않는 문제/ })).toBeTruthy();
  expect(h.ghIssue).toHaveBeenCalledWith("alice", "alice", "demo", 7);
  expect(await screen.findByText(/이미지: 스크린샷/)).toBeTruthy();
  expect(container.querySelector("img")).toBeNull();
  expect(await screen.findByText(/확인했어요/)).toBeTruthy();
  expect(h.ghComments).toHaveBeenCalledWith("alice", "alice", "demo", 7, { page: 1 });
});

it("댓글의 raw HTML 은 렌더하지 않는다", async () => {
  const { container } = renderAt("/github/alice/demo/issues/7?as=alice");
  await screen.findByText(/확인했어요/);
  expect(container.querySelector("b")).toBeNull();
  expect(container.textContent).toContain("은 그대로 글자로 보여야 해요");
});

it("댓글이 없으면 그렇다고 말하고, 댓글 조회가 실패해도 이슈 본문은 남는다", async () => {
  h.ghComments.mockImplementation(async () => envelope([], A, page()));
  renderAt("/github/alice/demo/issues/7?as=alice");
  expect(await screen.findByText(/댓글이 없어요/)).toBeTruthy();
  cleanup();
  h.ghComments.mockImplementation(async () => { throw new GhApiError({ status: 504, code: "gh_timeout", message: "x" }); });
  renderAt("/github/alice/demo/issues/7?as=alice");
  expect(await screen.findByText(/응답이 늦어요/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: /저장 버튼이 눌리지 않는 문제/ })).toBeTruthy();
});

it("PR 번호를 이슈로 열면 PR 화면으로 안내한다", async () => {
  h.ghIssue.mockImplementation(async () => envelope({ ...ISSUE, kind: "pull" }, A));
  renderAt("/github/alice/demo/issues/7?as=alice");
  const link = await screen.findByRole("link", { name: /PR 로 열기/ });
  expect(link.getAttribute("href")).toBe("/github/alice/demo/pulls/7?as=alice");
});

it("이슈 번호가 올바르지 않으면 서버를 부르지 않는다", async () => {
  renderAt("/github/alice/demo/issues/0?as=alice");
  expect(await screen.findByText(/찾을 수 없거나 권한이 없어요/)).toBeTruthy();
  expect(h.ghIssue).not.toHaveBeenCalled();
});
