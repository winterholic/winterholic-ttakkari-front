import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ACCOUNTS, PATCH_SMALL, PULL, PULLS, PULL_FILES, REPO, envelope, pullItem } from "../fixtures";

const h = vi.hoisted(() => ({ ghAccounts: vi.fn(), ghRepo: vi.fn(), ghPulls: vi.fn(), ghPull: vi.fn(), ghPullFiles: vi.fn() }));
vi.mock("../../../api/githubClient", async (orig) => ({
  ...(await orig<typeof import("../../../api/githubClient")>()),
  ghAccounts: (...a: unknown[]) => h.ghAccounts(...a),
  ghRepo: (...a: unknown[]) => h.ghRepo(...a),
  ghPulls: (...a: unknown[]) => h.ghPulls(...a),
  ghPull: (...a: unknown[]) => h.ghPull(...a),
  ghPullFiles: (...a: unknown[]) => h.ghPullFiles(...a),
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
const page = (more = false, n = 1) => ({ page: { page: n, has_more: more } });

beforeEach(() => {
  h.ghAccounts.mockImplementation(async () => ({ data: ACCOUNTS }));
  h.ghRepo.mockImplementation(async () => envelope(REPO, A));
  h.ghPulls.mockImplementation(async () => envelope(PULLS, A, page()));
  h.ghPull.mockImplementation(async () => envelope(PULL, A));
  h.ghPullFiles.mockImplementation(async () => envelope(PULL_FILES, A, page()));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("PR 목록은 기본이 열린 PR 이고 상태 배지와 상세 링크를 준다", async () => {
  renderAt("/github/alice/demo/pulls?as=alice");
  const link = await screen.findByRole("link", { name: /로그인 화면의 접근성 개선/ });
  expect(link.getAttribute("href")).toBe("/github/alice/demo/pulls/12?as=alice");
  expect(h.ghPulls).toHaveBeenCalledWith("alice", "alice", "demo", { state: "open", page: 1 });
  expect(screen.getByText("머지됨")).toBeTruthy();
  expect(screen.getByText("초안")).toBeTruthy();
  expect(screen.getAllByText(/feature\/a11y/).length).toBeGreaterThan(0);
});

it("상태 필터는 URL 쿼리에 두고 다시 조회한다", async () => {
  renderAt("/github/alice/demo/pulls?as=alice");
  await screen.findByRole("link", { name: /로그인 화면/ });
  fireEvent.click(screen.getByRole("button", { name: "닫힘" }));
  await waitFor(() => expect(where()).toBe("/github/alice/demo/pulls?as=alice&state=closed"));
  await waitFor(() => expect(h.ghPulls).toHaveBeenLastCalledWith("alice", "alice", "demo", { state: "closed", page: 1 }));
});

it("목록은 has_more 가 있을 때만 더 보기를 주고 다음 페이지를 이어 붙인다", async () => {
  h.ghPulls.mockImplementation(async (_a: string, _o: string, _r: string, q: { page: number }) =>
    q.page === 1 ? envelope([pullItem({ number: 1, title: "첫 페이지" })], A, page(true, 1)) : envelope([pullItem({ number: 2, title: "둘째 페이지" })], A, page(false, 2)));
  renderAt("/github/alice/demo/pulls?as=alice");
  await screen.findByText("첫 페이지");
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(await screen.findByText("둘째 페이지")).toBeTruthy();
  expect(screen.getByText("첫 페이지")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
});

it("PR 이 없으면 빈 상태", async () => {
  h.ghPulls.mockImplementation(async () => envelope([], A, page()));
  renderAt("/github/alice/demo/pulls?as=alice");
  expect(await screen.findByText(/PR 이 없어요/)).toBeTruthy();
});

it("다음 페이지만 실패하면 받은 목록은 남기고 그 아래에 오류와 재시도를 둔다", async () => {
  h.ghPulls.mockImplementation(async (_a: string, _o: string, _r: string, q: { page: number }) => {
    if (q.page === 1) return envelope([pullItem({ number: 1, title: "첫 페이지" })], A, page(true, 1));
    throw new GhApiError({ status: 504, code: "gh_timeout", message: "x" });
  });
  renderAt("/github/alice/demo/pulls?as=alice");
  await screen.findByText("첫 페이지");
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(await screen.findByText(/응답이 늦어요/)).toBeTruthy();
  expect(screen.getByText("첫 페이지")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});

it("PR 상세는 브랜치·통계·병합 가능 여부·본문을 보여 준다", async () => {
  renderAt("/github/alice/demo/pulls/12?as=alice");
  expect(await screen.findByRole("heading", { name: /로그인 화면의 접근성 개선/ })).toBeTruthy();
  expect(h.ghPull).toHaveBeenCalledWith("alice", "alice", "demo", 12);
  expect(screen.getByText(/feature\/a11y/)).toBeTruthy();
  expect(screen.getByText("+40")).toBeTruthy();
  expect(screen.getByText("−12")).toBeTruthy();
  expect(screen.getByText(/충돌 없이 병합할 수 있어요/)).toBeTruthy();
  expect(screen.getByText("항목 둘")).toBeTruthy();
});

it("mergeable 이 계산 중이면 그렇게 안내한다", async () => {
  h.ghPull.mockImplementation(async () => envelope({ ...PULL, mergeable: "computing" }, A));
  renderAt("/github/alice/demo/pulls/12?as=alice");
  expect(await screen.findByText(/계산 중/)).toBeTruthy();
});

it("충돌이 있으면 그렇게 안내한다", async () => {
  h.ghPull.mockImplementation(async () => envelope({ ...PULL, mergeable: false, mergeable_state: "dirty" }, A));
  renderAt("/github/alice/demo/pulls/12?as=alice");
  expect(await screen.findByText(/충돌이 있어요/)).toBeTruthy();
});

it("변경 파일 탭은 ?tab=files 로 바뀌고 새로고침해도 그 탭이 열린다", async () => {
  renderAt("/github/alice/demo/pulls/12?as=alice");
  fireEvent.click(await screen.findByRole("button", { name: /변경 파일/ }));
  await waitFor(() => expect(where()).toBe("/github/alice/demo/pulls/12?as=alice&tab=files"));
  cleanup();
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  expect(await screen.findByRole("button", { name: /src\/index\.ts/ })).toBeTruthy();
  expect(h.ghPullFiles).toHaveBeenCalledWith("alice", "alice", "demo", 12, { page: 1 });
});

it("파일은 기본 접힘이고 펼치면 +/− 기호와 줄 번호가 보인다", async () => {
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  const toggle = await screen.findByRole("button", { name: /src\/index\.ts/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const table = await screen.findByRole("table");
  const rows = within(table).getAllByRole("row");
  const signs = rows.map((r) => r.getAttribute("data-diff"));
  expect(signs).toContain("+");
  expect(signs).toContain("-");
  expect(within(table).getAllByText("+").length).toBeGreaterThan(0);
  expect(within(table).getAllByText("−").length).toBeGreaterThan(0);
  expect(within(table).getByText("const next = 2;")).toBeTruthy();
  expect(PATCH_SMALL).toContain("const next = 2;");
});

it("patch 가 없는 파일은 누락을 명시하고 GitHub 링크를 준다", async () => {
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  const toggle = await screen.findByRole("button", { name: /assets\/logo\.png/ });
  fireEvent.click(toggle);
  expect(await screen.findByText(/변경 내용\(patch\)을 받지 못했어요/)).toBeTruthy();
  const hrefs = screen.getAllByRole("link", { name: /GitHub 에서 열기/ }).map((a) => a.getAttribute("href"));
  expect(hrefs).toContain("https://github.com/alice/demo/pull/12/files");
});

it("이름이 바뀐 파일은 이전 이름을 함께 보여 준다", async () => {
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  fireEvent.click(await screen.findByRole("button", { name: /with-an-extremely-long-component-file-name\.test\.tsx/ }));
  expect(screen.getByText(/src\/old-name\.test\.tsx/)).toBeTruthy();
});

it("200KB 가 넘는 patch 는 한 번 더 확인한 뒤에 펼친다", async () => {
  const huge = "@@ -1,1 +1,1 @@\n" + "+".padEnd(210 * 1024, "x");
  h.ghPullFiles.mockImplementation(async () => envelope([{ filename: "big.js", status: "modified", additions: 1, deletions: 0, patch: huge, patch_missing: false }], A, page()));
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  fireEvent.click(await screen.findByRole("button", { name: /big\.js/ }));
  expect(await screen.findByText(/변경이 커서/)).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "그래도 펼치기" }));
  expect(await screen.findByRole("table")).toBeTruthy();
});

it("큰 diff 로 상류가 거절하면 GitHub 에서 열기를 권한다", async () => {
  h.ghPullFiles.mockImplementation(async () => { throw new GhApiError({ status: 422, code: "gh_unprocessable", message: "x" }); });
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  expect(await screen.findByText(/GitHub 가 이 내용을 주지 않았어요/)).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /GitHub 에서 열기/ }).length).toBeGreaterThan(0);
});

it("불러온 파일 수가 변경 파일 수보다 적으면 부분임을 알린다", async () => {
  h.ghPull.mockImplementation(async () => envelope({ ...PULL, changed_files: 3200 }, A));
  renderAt("/github/alice/demo/pulls/12?as=alice&tab=files");
  expect(await screen.findByText(/3,200개 중 3개/)).toBeTruthy();
  expect(screen.getByText(/최대 3,000개/)).toBeTruthy();
});

it("PR 번호가 숫자가 아니면 서버를 부르지 않는다", async () => {
  renderAt("/github/alice/demo/pulls/abc?as=alice");
  expect(await screen.findByText(/찾을 수 없거나 권한이 없어요/)).toBeTruthy();
  expect(h.ghPull).not.toHaveBeenCalled();
});
