import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import * as S from "./contractSamples";
import { ACCOUNTS, envelope, pageOf } from "./fixtures";

// 백엔드 계약 fixture 원문(contractSamples.ts)으로 화면을 그린다. 필드가 null 인 실제 응답에서 깨지지 않는지 본다.
const h = vi.hoisted(() => ({
  ghAccounts: vi.fn(), ghMe: vi.fn(), ghMyOrgs: vi.fn(), ghMyRepos: vi.fn(), ghRepo: vi.fn(), ghContents: vi.fn(), ghReadme: vi.fn(), ghBranches: vi.fn(),
  ghPulls: vi.fn(), ghPull: vi.fn(), ghPullFiles: vi.fn(), ghIssues: vi.fn(), ghIssue: vi.fn(), ghComments: vi.fn(), ghRuns: vi.fn(), ghRun: vi.fn(), ghRunJobs: vi.fn(), ghJobLogs: vi.fn(),
}));
vi.mock("../../api/githubClient", async (orig) => {
  const real = await orig<typeof import("../../api/githubClient")>();
  return { ...real, ...Object.fromEntries(Object.entries(h).map(([k, fn]) => [k, (...a: unknown[]) => fn(...a)])) };
});

import { GithubPage } from "../../pages/GithubPage";

const A = "alice";
function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><Routes><Route path="/github/*" element={<GithubPage />} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  h.ghAccounts.mockImplementation(async () => ({ accounts: ACCOUNTS, gh_available: true, fetched_at: "2026-10-18T01:00:00+00:00" }));
  h.ghMe.mockImplementation(async () => envelope(S.ME, A));
  h.ghMyOrgs.mockImplementation(async () => envelope(S.ORGS, A));
  h.ghMyRepos.mockImplementation(async () => envelope(S.REPOS, A, pageOf()));
  h.ghRepo.mockImplementation(async () => envelope(S.REPO, A));
  h.ghContents.mockImplementation(async () => envelope(S.CONTENTS_DIR, A));
  h.ghReadme.mockImplementation(async () => envelope(S.README, A));
  h.ghBranches.mockImplementation(async () => envelope(S.BRANCHES, A, pageOf()));
  h.ghPulls.mockImplementation(async () => envelope(S.PULLS, A, pageOf()));
  h.ghPull.mockImplementation(async () => envelope(S.PULL, A));
  h.ghPullFiles.mockImplementation(async () => envelope(S.PULL_FILES, A, pageOf()));
  h.ghIssues.mockImplementation(async () => envelope(S.ISSUES, A, pageOf()));
  h.ghIssue.mockImplementation(async () => envelope(S.ISSUE, A));
  h.ghComments.mockImplementation(async () => envelope(S.ISSUE_COMMENTS, A, pageOf()));
  h.ghRuns.mockImplementation(async () => envelope(S.RUNS, A, pageOf()));
  h.ghRun.mockImplementation(async () => envelope(S.RUN, A));
  h.ghRunJobs.mockImplementation(async () => envelope(S.JOBS, A, pageOf()));
  h.ghJobLogs.mockImplementation(async () => envelope({ job_id: 900, from_line: 1, lines: ["a", "b"], total_lines: 2, next_from_line: null, truncated: false, masked: true }, A));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("홈: 조직 owner 가 객체인 저장소·html_url 없는 조직·본인 프로필", async () => {
  renderAt("/github?as=alice");
  expect(await screen.findByText("Octo Cat")).toBeTruthy();
  const repoLink = await screen.findByRole("link", { name: /acme\/widget/ });
  expect(repoLink.getAttribute("href")).toBe("/github/acme/widget?as=alice");
  expect(screen.getAllByRole("link", { name: /acme/ }).some((a) => a.getAttribute("href") === "/github/acme?as=alice")).toBe(true);
});

it("저장소: 권한·토픽·라이선스·빈 homepage", async () => {
  renderAt("/github/acme/widget?as=alice");
  expect(await screen.findByText(/내 권한 쓰기/)).toBeTruthy();
  expect(screen.getByText("cli")).toBeTruthy();
  expect(screen.getByText("MIT License")).toBeTruthy();
});

it("디렉터리: dir·file·symlink·submodule 항목과 정렬", async () => {
  renderAt("/github/acme/widget/code?as=alice&path=src");
  const list = await screen.findByRole("list", { name: "파일 목록" });
  const names = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
  expect(names[0]).toMatch(/^Util/);
  expect(names[1]).toMatch(/^vendor/);
  expect(names.at(-1)).toMatch(/^link/);
});

it("파일: 한글 본문·줄 수, 이진, 거대 파일(본문 없음)", async () => {
  h.ghContents.mockImplementation(async () => envelope(S.CONTENTS_FILE, A));
  renderAt("/github/acme/widget/code?as=alice&path=src%2Fmain.py");
  expect(await screen.findByText("print('안녕')")).toBeTruthy();
  expect(screen.getAllByText(/2줄/).length).toBeGreaterThan(0);
  cleanup();
  h.ghContents.mockImplementation(async () => envelope(S.CONTENTS_FILE_BINARY, A));
  renderAt("/github/acme/widget/code?as=alice&path=logo.png");
  expect(await screen.findByText(/이진 파일은 미리 볼 수 없어요/)).toBeTruthy();
  cleanup();
  h.ghContents.mockImplementation(async () => envelope(S.CONTENTS_FILE_HUGE, A));
  renderAt("/github/acme/widget/code?as=alice&path=big.log");
  expect(await screen.findByText(/너무 커서/)).toBeTruthy();
  expect(screen.getByText(/5\.0 MB/, { selector: "span" })).toBeTruthy();
});

it("심링크 대상과 서브모듈(.git 을 뗀 github 링크)", async () => {
  h.ghContents.mockImplementation(async () => envelope(S.CONTENTS_SYMLINK, A));
  renderAt("/github/acme/widget/code?as=alice&path=src%2Flink");
  expect(await screen.findByText(/\.\.\/README\.md/)).toBeTruthy();
  cleanup();
  h.ghContents.mockImplementation(async () => envelope(S.CONTENTS_SUBMODULE, A));
  renderAt("/github/acme/widget/code?as=alice&path=src%2Fvendor");
  const link = await screen.findByRole("link", { name: /GitHub 에서 열기/ });
  expect(link.getAttribute("href")).toBe("https://github.com/acme/vendor-lib");
});

it("README 는 contents 와 같은 모양에서 읽는다", async () => {
  renderAt("/github/acme/widget?as=alice");
  expect(await screen.findByRole("heading", { name: "Hello" })).toBeTruthy();
});

it("PR: 포크가 삭제된 head(repo_full_name null)와 계산 중 mergeable", async () => {
  renderAt("/github/acme/widget/pulls?as=alice");
  await screen.findAllByRole("link", { name: /Add login UI|Fix typo/ });
  expect(screen.getByText(/feature\/login-ui → main/)).toBeTruthy();
  cleanup();
  renderAt("/github/acme/widget/pulls/7?as=alice");
  expect(await screen.findByText(/계산 중/)).toBeTruthy();
  expect(screen.getByText("+120")).toBeTruthy();
});

it("PR 파일: patch_state ok/empty/unavailable/truncated 를 구분한다", async () => {
  renderAt("/github/acme/widget/pulls/7?as=alice&tab=files");
  fireEvent.click(await screen.findByRole("button", { name: /docs\/new-name\.md/ }));
  expect(await screen.findByText(/이름·권한만 바뀐 파일/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /assets\/logo\.png/ }));
  expect(await screen.findByText(/변경 내용\(patch\)을 받지 못했어요/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /src\/long\.ts/ }));
  expect(await screen.findByText(/앞부분만 보여 줘요\(256KiB\)/)).toBeTruthy();
});

it("이슈·PR 번호 이슈·사용자/본문이 null 인 댓글", async () => {
  renderAt("/github/acme/widget/issues?as=alice");
  expect((await screen.findAllByRole("link", { name: /Crash on start/ })).length).toBe(2);
  cleanup();
  renderAt("/github/acme/widget/issues/3?as=alice");
  expect(await screen.findByText("me too")).toBeTruthy();
  expect(screen.getByText("알 수 없음", { selector: "strong" })).toBeTruthy();
  expect(screen.getByText(/내용이 없는 댓글/)).toBeTruthy();
  expect(screen.getByText(/마일스톤 v1/)).toBeTruthy();
  cleanup();
  h.ghIssue.mockImplementation(async () => envelope(S.ISSUE_AS_PULL, A));
  renderAt("/github/acme/widget/issues/7?as=alice");
  expect(await screen.findByRole("link", { name: /PR 로 열기/ })).toBeTruthy();
  expect(h.ghComments).not.toHaveBeenCalledWith(A, "acme", "widget", 7, { page: 1 });
});

it("Actions: run·job(처음 실패 step)·시도 횟수", async () => {
  renderAt("/github/acme/widget/actions/runs/500?as=alice");
  expect(await screen.findByText("Merge pull request #7", { selector: "h2" })).toBeTruthy();
  expect(await screen.findByText("처음 실패")).toBeTruthy();
  expect(screen.getByText(/시도 2/)).toBeTruthy();
});

it("로그: 모든 줄이 끝이면 다음 버튼이 없다", async () => {
  renderAt("/github/acme/widget/actions/runs/500/jobs/900?as=alice");
  expect(await screen.findByRole("region", { name: "로그" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /다음/ })).toBeNull();
});

it("로그 창이 글자 수 상한으로 줄면 서버가 준 next_from_line 으로 이어 읽는다", async () => {
  h.ghJobLogs.mockImplementation(async () => envelope({ job_id: 900, from_line: 1, lines: ["a", "b", "c"], total_lines: 10, next_from_line: 4, truncated: true, masked: true }, A));
  renderAt("/github/acme/widget/actions/runs/500/jobs/900?as=alice");
  const next = await screen.findByRole("button", { name: /다음 7줄/ });
  expect(next).toBeTruthy();
  expect(screen.getByText(/글자 수 제한/)).toBeTruthy();
});
