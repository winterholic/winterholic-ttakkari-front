import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ACCOUNTS, ORGS, PROFILE, REPOS, envelope } from "../features/github/fixtures";

const h = vi.hoisted(() => ({
  ghAccounts: vi.fn(), ghResolve: vi.fn(), ghMe: vi.fn(), ghMyOrgs: vi.fn(), ghMyRepos: vi.fn(), ghOwner: vi.fn(), ghOwnerRepos: vi.fn(),
}));
vi.mock("../api/githubClient", async (orig) => ({
  ...(await orig<typeof import("../api/githubClient")>()),
  ghAccounts: (...a: unknown[]) => h.ghAccounts(...a),
  ghResolve: (...a: unknown[]) => h.ghResolve(...a),
  ghMe: (...a: unknown[]) => h.ghMe(...a),
  ghMyOrgs: (...a: unknown[]) => h.ghMyOrgs(...a),
  ghMyRepos: (...a: unknown[]) => h.ghMyRepos(...a),
  ghOwner: (...a: unknown[]) => h.ghOwner(...a),
  ghOwnerRepos: (...a: unknown[]) => h.ghOwnerRepos(...a),
}));

import { GhApiError } from "../api/githubClient";
import { GithubPage } from "./GithubPage";
import { FEATURES } from "../shell/features";

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/github/*" element={<GithubPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

const where = () => screen.getByTestId("where").textContent;

beforeEach(() => {
  window.localStorage.clear();
  h.ghAccounts.mockImplementation(async () => ({ accounts: ACCOUNTS, gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  h.ghMe.mockImplementation(async (account: string) => envelope({ ...PROFILE, login: account }, account));
  h.ghMyOrgs.mockImplementation(async (account: string) => envelope(ORGS, account));
  h.ghMyRepos.mockImplementation(async (account: string) => envelope(REPOS, account, { page: { page: 1, per_page: 30, has_more: false, total_count: null, limit_hit: false } }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("메뉴 기능 목록에 GitHub 가 있고 /github 로 간다", () => {
  const f = FEATURES.find((x) => x.root === "github");
  expect(f?.to).toBe("/github");
  expect(f?.label).toBe("GitHub");
});

it("as 가 없고 계정이 둘이면 계정 선택 화면을 보여 준다", async () => {
  renderAt("/github");
  expect(await screen.findByRole("heading", { name: "GitHub 계정 선택" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /alice/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /bob-work/ })).toBeTruthy();
  expect(h.ghMe).not.toHaveBeenCalled();
});

it("계정을 고르면 as 가 붙고 login 만 localStorage 에 저장한다", async () => {
  renderAt("/github");
  fireEvent.click(await screen.findByRole("button", { name: /bob-work/ }));
  await waitFor(() => expect(where()).toBe("/github?as=bob-work"));
  expect(window.localStorage.getItem("ttakkari.github.account")).toBe(JSON.stringify("bob-work"));
  const saved = Object.values(window.localStorage).join("|");
  expect(saved).not.toMatch(/token|ghp_|Bearer/i);
});

it("저장된 마지막 계정이 아직 유효하면 선택 화면 없이 as 를 replace 로 채운다", async () => {
  window.localStorage.setItem("ttakkari.github.account", JSON.stringify("bob-work"));
  renderAt("/github/acme?state=closed");
  await waitFor(() => expect(where()).toBe("/github/acme?state=closed&as=bob-work"));
});

it("as 가 목록에 없는 계정이면 선택 화면과 안내를 보여 준다", async () => {
  renderAt("/github?as=ghost");
  expect(await screen.findByRole("heading", { name: "GitHub 계정 선택" })).toBeTruthy();
  expect(screen.getByText(/ghost 계정을 찾을 수 없어요/)).toBeTruthy();
});

it("만료된 계정은 고를 수 없고 이유를 말한다", async () => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: [ACCOUNTS[0], { ...ACCOUNTS[1], state: "error" }, { ...ACCOUNTS[1], login: "carol-oss" }], gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  renderAt("/github");
  const bob = await screen.findByRole("button", { name: /bob-work/ });
  expect((bob as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/gh auth login/)).toBeTruthy();
});

it("쓸 수 있는 계정이 하나뿐이면 바로 그 계정으로 연다", async () => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: [ACCOUNTS[0]], gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  renderAt("/github");
  await waitFor(() => expect(where()).toBe("/github?as=alice"));
});

it("계정이 하나도 없으면 gh auth login 안내", async () => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: [], gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  renderAt("/github");
  expect(await screen.findByText(/gh auth login/)).toBeTruthy();
});

it("계정 목록 오류는 다시 시도할 수 있다", async () => {
  h.ghAccounts.mockRejectedValueOnce(new GhApiError({ status: 503, code: "no_account", message: "x" }));
  renderAt("/github");
  expect(await screen.findByText(/연결된 GitHub 계정이 없어요/)).toBeTruthy();
});

it("홈은 선택 계정의 프로필·조직·저장소를 보여 주고 모든 호출에 그 계정을 쓴다", async () => {
  renderAt("/github?as=alice");
  expect(await screen.findByText("Alice Kim")).toBeTruthy();
  expect(await screen.findByText("acme-labs")).toBeTruthy();
  expect(await screen.findByText("alice/demo")).toBeTruthy();
  expect(h.ghMe).toHaveBeenCalledWith("alice");
  expect(h.ghMyOrgs).toHaveBeenCalledWith("alice");
  expect(h.ghMyRepos.mock.calls[0][0]).toBe("alice");
});

it("계정을 전환하면 이전 계정 데이터가 남지 않고 새 계정 데이터만 보인다", async () => {
  let release: (v: unknown) => void = () => {};
  const { qc } = renderAt("/github?as=alice");
  expect(await screen.findByText("Alice Kim")).toBeTruthy();
  h.ghMe.mockImplementation((account: string) => new Promise((res) => { release = () => res(envelope({ ...PROFILE, login: account, name: "Bob Work" }, account)); }));
  fireEvent.click(screen.getByRole("button", { name: /계정 전환/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /bob-work/ }));
  await waitFor(() => expect(where()).toBe("/github?as=bob-work"));
  // 새 계정 응답 전에는 이전 계정(alice)의 프로필이 보이면 안 된다
  expect(screen.queryByText("Alice Kim")).toBeNull();
  expect(qc.getQueryCache().findAll({ queryKey: ["github", "alice"] })).toHaveLength(0);
  release(null);
  expect(await screen.findByText("Bob Work")).toBeTruthy();
});

it("계정을 바꿔도 같은 화면의 나머지 쿼리(state·ref 등)는 유지한다", async () => {
  renderAt("/github/o/r/code?as=alice&ref=feat%2Fx&path=src");
  // 저장소 화면은 아직 호출 모킹이 없어 오류 상태가 되지만 헤더의 계정 메뉴는 열린다
  fireEvent.click(await screen.findByRole("button", { name: /alice/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /bob-work/ }));
  await waitFor(() => expect(where()).toContain("as=bob-work"));
  expect(where()).toContain("ref=feat%2Fx");
  expect(where()).toContain("path=src");
});

it("저장소 주소를 넣으면 입력 해석 결과 필드로 이동한다(as 유지)", async () => {
  h.ghResolve.mockResolvedValue({ kind: "pull", owner: "acme", repo: "widgets", number: 5 });
  renderAt("/github?as=alice");
  const input = await screen.findByLabelText("저장소 주소");
  fireEvent.change(input, { target: { value: "https://github.com/acme/widgets/pull/5?x=1" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(where()).toBe("/github/acme/widgets/pulls/5?as=alice"));
  expect(h.ghResolve).toHaveBeenCalledWith("https://github.com/acme/widgets/pull/5?x=1", "alice");
});

it("열 수 없는 주소는 입력 아래에 이유를 보여 주고 이동하지 않는다", async () => {
  h.ghResolve.mockRejectedValue(new GhApiError({ status: 422, code: "unsupported_host", message: "x" }));
  renderAt("/github?as=alice");
  const input = await screen.findByLabelText("저장소 주소");
  fireEvent.change(input, { target: { value: "https://gitlab.com/a/b" } });
  fireEvent.submit(input.closest("form")!);
  expect(await screen.findByText(/github.com 저장소만/)).toBeTruthy();
  expect(where()).toBe("/github?as=alice");
});

it("최근 대상은 owner/repo 와 계정 이름만 기억하고 선택 계정 것만 보여 준다", async () => {
  h.ghResolve.mockResolvedValue({ kind: "repo", owner: "acme", repo: "widgets" });
  renderAt("/github?as=alice");
  const input = await screen.findByLabelText("저장소 주소");
  fireEvent.change(input, { target: { value: "acme/widgets" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(where()).toBe("/github/acme/widgets?as=alice"));
  const stored = window.localStorage.getItem("ttakkari.github.recent") ?? "";
  expect(JSON.parse(stored)).toEqual([{ account: "alice", owner: "acme", repo: "widgets" }]);
  cleanup();
  renderAt("/github?as=bob-work");
  await screen.findByLabelText("저장소 주소");
  expect(screen.queryByRole("link", { name: /acme\/widgets/ })).toBeNull();
});

it("내 저장소 로딩 중에는 스켈레톤, 오류면 재시도 버튼", async () => {
  h.ghMyRepos.mockImplementation(async () => { throw new GhApiError({ status: 504, code: "gh_timeout", message: "x" }); });
  renderAt("/github?as=alice");
  const retry = await screen.findByRole("button", { name: "다시 시도" });
  h.ghMyRepos.mockImplementation(async (account: string) => envelope(REPOS, account, { page: { page: 1, per_page: 30, has_more: false, total_count: null, limit_hit: false } }));
  fireEvent.click(retry);
  expect(await screen.findByText("alice/demo")).toBeTruthy();
});

it("한도 오류는 풀리는 시각까지 남은 시간을 보여 준다", async () => {
  const reset = Math.floor(Date.now() / 1000) + 125;
  h.ghMyRepos.mockImplementation(async () => { throw new GhApiError({ status: 429, code: "gh_rate_limited", message: "x", reset }); });
  renderAt("/github?as=alice");
  expect(await screen.findByText(/호출 한도/)).toBeTruthy();
  expect(await screen.findByText(/2분 0\d초/)).toBeTruthy();
});

it("사용자 owner 와 조직 owner 를 type 으로 구분해 보여 준다", async () => {
  h.ghOwner.mockImplementation(async (account: string) => envelope({ ...PROFILE, login: "acme-labs", name: "Acme Labs", type: "Organization" }, account));
  h.ghOwnerRepos.mockImplementation(async (account: string) => envelope(REPOS, account, { page: { page: 1, per_page: 30, has_more: false, total_count: null, limit_hit: false } }));
  renderAt("/github/acme-labs?as=alice");
  expect(await screen.findByText("조직")).toBeTruthy();
  expect(await screen.findByText("alice/demo")).toBeTruthy();
  expect(within(document.body).getAllByText("Acme Labs").length).toBeGreaterThan(0);
});

it("gh 를 찾을 수 없는 Mac Studio 는 gh 설치·로그인을 안내한다", async () => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: [], gh_available: false, fetched_at: "2026-10-18T01:00:00Z" }));
  renderAt("/github");
  expect(await screen.findByText(/gh 를 찾을 수 없어요/)).toBeTruthy();
  expect(screen.getByText(/gh auth login/)).toBeTruthy();
});

it("ref 를 못 가른 해석 결과는 틀린 곳이 아니라 저장소 첫 화면으로 보낸다", async () => {
  h.ghResolve.mockResolvedValue({ kind: "code", owner: "acme", repo: "widgets", ref: "feat", path: "x/y", needs_ref_resolution: true, ref_path: "feat/x/y" });
  renderAt("/github?as=alice");
  const input = await screen.findByLabelText("저장소 주소");
  fireEvent.change(input, { target: { value: "https://github.com/acme/widgets/tree/feat/x/y" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(where()).toBe("/github/acme/widgets?as=alice"));
});

it("SSO 승인 주소는 https://github.com 일 때만 링크로 연다", async () => {
  h.ghMyRepos.mockImplementation(async () => { throw new GhApiError({ status: 403, code: "gh_forbidden", message: "x", reason: "sso_required", ssoUrl: "https://github.com/orgs/acme/sso?x=1" }); });
  renderAt("/github?as=alice");
  const link = await screen.findByRole("link", { name: /SSO 승인 화면 열기/ });
  expect(link.getAttribute("href")).toBe("https://github.com/orgs/acme/sso?x=1");
  cleanup();
  h.ghMyRepos.mockImplementation(async () => { throw new GhApiError({ status: 403, code: "gh_forbidden", message: "x", reason: "sso_required", ssoUrl: "https://evil.example/sso" }); });
  renderAt("/github?as=alice");
  await screen.findByText(/조직 SSO 승인이 필요해요/);
  expect(screen.queryByRole("link", { name: /SSO 승인 화면 열기/ })).toBeNull();
});
