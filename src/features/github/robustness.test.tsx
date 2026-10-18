import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { useRef } from "react";
import { ACCOUNTS, COMMENTS, DIR_ROOT, ISSUE, ISSUES, JOBS, ORGS, PROFILE, PULL, PULLS, PULL_FILES, README, REPO, REPOS, RUNS, envelope, logWindow } from "./fixtures";

const h = vi.hoisted(() => ({
  ghAccounts: vi.fn(), ghResolve: vi.fn(), ghMe: vi.fn(), ghMyOrgs: vi.fn(), ghMyRepos: vi.fn(), ghOwner: vi.fn(), ghOwnerRepos: vi.fn(),
  ghRepo: vi.fn(), ghContents: vi.fn(), ghReadme: vi.fn(), ghBranches: vi.fn(), ghPulls: vi.fn(), ghPull: vi.fn(), ghPullFiles: vi.fn(),
  ghIssues: vi.fn(), ghIssue: vi.fn(), ghComments: vi.fn(), ghRuns: vi.fn(), ghRun: vi.fn(), ghRunJobs: vi.fn(), ghJobLogs: vi.fn(),
}));
vi.mock("../../api/githubClient", async (orig) => {
  const real = await orig<typeof import("../../api/githubClient")>();
  const wrap = Object.fromEntries(Object.entries(h).map(([k, fn]) => [k, (...a: unknown[]) => fn(...a)]));
  return { ...real, ...wrap };
});

import { GhApiError } from "../../api/githubClient";
import { GithubPage } from "../../pages/GithubPage";
import { scrollMemory, useScrollRestore } from "./useScrollRestore";

const A = "alice";
const page = { page: { page: 1, has_more: false } };

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

beforeEach(() => {
  window.localStorage.clear();
  h.ghAccounts.mockImplementation(async () => ({ data: ACCOUNTS }));
  h.ghMe.mockImplementation(async () => envelope(PROFILE, A));
  h.ghMyOrgs.mockImplementation(async () => envelope(ORGS, A));
  h.ghMyRepos.mockImplementation(async () => envelope(REPOS, A, page));
  h.ghOwner.mockImplementation(async () => envelope(PROFILE, A));
  h.ghOwnerRepos.mockImplementation(async () => envelope(REPOS, A, page));
  h.ghRepo.mockImplementation(async () => envelope(REPO, A));
  h.ghContents.mockImplementation(async () => envelope(DIR_ROOT, A));
  h.ghReadme.mockImplementation(async () => envelope(README, A));
  h.ghBranches.mockImplementation(async () => envelope([], A, page));
  h.ghPulls.mockImplementation(async () => envelope(PULLS, A, page));
  h.ghPull.mockImplementation(async () => envelope(PULL, A));
  h.ghPullFiles.mockImplementation(async () => envelope(PULL_FILES, A, page));
  h.ghIssues.mockImplementation(async () => envelope(ISSUES, A, page));
  h.ghIssue.mockImplementation(async () => envelope(ISSUE, A));
  h.ghComments.mockImplementation(async () => envelope(COMMENTS, A, page));
  h.ghRuns.mockImplementation(async () => envelope(RUNS, A, page));
  h.ghRun.mockImplementation(async () => envelope(RUNS[0], A));
  h.ghRunJobs.mockImplementation(async () => envelope(JOBS, A, page));
  h.ghJobLogs.mockImplementation(async () => envelope(logWindow(1, 50), A));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  scrollMemory.clear();
});

const ROUTES = [
  "/github?as=alice",
  "/github/alice?as=alice",
  "/github/alice/demo?as=alice",
  "/github/alice/demo/code?as=alice&path=src",
  "/github/alice/demo/pulls?as=alice",
  "/github/alice/demo/pulls/12?as=alice",
  "/github/alice/demo/issues?as=alice",
  "/github/alice/demo/issues/7?as=alice",
  "/github/alice/demo/actions?as=alice",
  "/github/alice/demo/actions/runs/9001?as=alice",
  "/github/alice/demo/actions/runs/9001/jobs/5001?as=alice",
];

it.each(ROUTES)("%s 의 모든 앱 안 링크가 선택 계정(as)을 유지한다", async (route) => {
  const { container } = renderAt(route);
  await waitFor(() => expect(container.querySelectorAll(".gh-skeleton").length).toBe(0));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  const internal = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/github"]')];
  expect(internal.length).toBeGreaterThan(0);
  for (const a of internal) expect(new URL(a.getAttribute("href")!, "http://x").searchParams.get("as")).toBe("alice");
  // 바깥으로 나가는 링크는 전부 https://github.com 이고 noopener noreferrer
  for (const a of container.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) {
    expect(a.getAttribute("href")).toMatch(/^https:\/\/(www\.)?github\.com\//);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
    expect(a.getAttribute("rel")).toMatch(/noreferrer/);
  }
});

it("화면에 로컬 경로·구현 설명이 새지 않는다", async () => {
  const { container } = renderAt("/github/alice/demo/actions/runs/9001/jobs/5001?as=alice");
  await screen.findByRole("region", { name: "로그" });
  expect(container.textContent).not.toMatch(/\/Users\/|~\/|localhost|127\.0\.0\.1|ADR|백엔드|subprocess|keyring/);
});

it("만료 계정(gh_auth_expired)을 만나도 따까리 로그인 상태는 건드리지 않고 안내만 한다", async () => {
  h.ghMyRepos.mockImplementation(async () => { throw new GhApiError({ status: 502, code: "gh_auth_expired", message: "x" }); });
  renderAt("/github?as=alice");
  expect(await screen.findByText(/계정 로그인이 만료됐어요/)).toBeTruthy();
  expect(screen.getByText(/따까리 로그인에는 영향이 없어요/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /bob-work 계정으로 열기/ })).toBeTruthy();
});

it("응답이 stale 이면 캐시 안내 띠를, 한도가 낮으면 경고 띠를 보여 준다", async () => {
  h.ghMyRepos.mockImplementation(async () => envelope(REPOS, A, { ...page, stale: true, rate: { limit: 5000, remaining: 40, reset: 1, low: true } }));
  renderAt("/github?as=alice");
  expect(await screen.findByText(/이전에 받아 둔 내용|받아 둔 내용을 보여 줘요/)).toBeTruthy();
  expect(screen.getByText(/남은 40회/)).toBeTruthy();
});

it("계정 전환 뒤 이전 계정의 응답이 같은 화면에 다시 섞이지 않는다", async () => {
  h.ghMyRepos.mockImplementation(async (account: string) =>
    envelope(account === "alice" ? [{ ...REPOS[0], full_name: "alice/private-a", name: "private-a", private: true }] : [{ ...REPOS[0], full_name: "bob-work/private-b", name: "private-b", owner: "bob-work" }], account, page));
  renderAt("/github?as=alice");
  expect(await screen.findByText("alice/private-a")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /계정 전환/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /bob-work/ }));
  expect(await screen.findByText("bob-work/private-b")).toBeTruthy();
  expect(screen.queryByText("alice/private-a")).toBeNull();
  // 다시 alice 로 돌아와도 캐시에서 bob 의 것을 보이지 않는다
  fireEvent.click(screen.getByRole("button", { name: /계정 전환/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /alice/ }));
  expect(await screen.findByText("alice/private-a")).toBeTruthy();
  expect(screen.queryByText("bob-work/private-b")).toBeNull();
});

it("계정 목록에서 사라진 계정의 캐시와 최근 목록을 지운다", async () => {
  window.localStorage.setItem("ttakkari.github.recent", JSON.stringify([{ account: "bob-work", owner: "o", repo: "r" }, { account: "alice", owner: "a", repo: "b" }]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["github", "ghost", "me"], { secret: true });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/github?as=alice"]}>
        <Routes><Route path="/github/*" element={<GithubPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Alice Kim");
  await waitFor(() => expect(client.getQueryData(["github", "ghost", "me"])).toBeUndefined());
});

// ---- 스크롤 복원
function ScrollProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useScrollRestore(ref);
  const nav = useNavigate();
  return (
    <div>
      <div ref={ref} data-testid="scroller"><div style={{ height: "4rem" }}>내용</div></div>
      <button type="button" onClick={() => nav("/two")}>이동</button>
      <button type="button" onClick={() => nav(-1)}>뒤로</button>
    </div>
  );
}

it("스크롤 위치를 이력 항목별로 기억하고 뒤로가기(POP)에서만 복원한다", async () => {
  const calls: number[] = [];
  const scrollTo = vi.fn(function (this: HTMLElement, o: ScrollToOptions) { calls.push(o.top ?? 0); this.scrollTop = o.top ?? 0; });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, writable: true, value: scrollTo });
  render(
    <MemoryRouter initialEntries={["/one"]}>
      <Routes>
        <Route path="/one" element={<ScrollProbe />} />
        <Route path="/two" element={<ScrollProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  const scroller = screen.getByTestId("scroller");
  scroller.scrollTop = 320;
  fireEvent.scroll(scroller);
  fireEvent.click(screen.getByRole("button", { name: "이동" }));
  // 새로 들어간 화면은 맨 위
  expect(calls.at(-1)).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
  await waitFor(() => expect(calls.at(-1)).toBe(320));
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});
