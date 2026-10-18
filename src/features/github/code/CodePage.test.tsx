import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ACCOUNTS, BRANCHES, DIR_ROOT, FILE_BINARY, FILE_LARGE, FILE_TEXT, README, REPO, codeLines, envelope, fileContents } from "../fixtures";

const h = vi.hoisted(() => ({ ghAccounts: vi.fn(), ghRepo: vi.fn(), ghContents: vi.fn(), ghReadme: vi.fn(), ghBranches: vi.fn() }));
vi.mock("../../../api/githubClient", async (orig) => ({
  ...(await orig<typeof import("../../../api/githubClient")>()),
  ghAccounts: (...a: unknown[]) => h.ghAccounts(...a),
  ghRepo: (...a: unknown[]) => h.ghRepo(...a),
  ghContents: (...a: unknown[]) => h.ghContents(...a),
  ghReadme: (...a: unknown[]) => h.ghReadme(...a),
  ghBranches: (...a: unknown[]) => h.ghBranches(...a),
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

beforeEach(() => {
  // jsdom 에는 dialog 의 열기·닫기가 없다
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  h.ghAccounts.mockImplementation(async () => ({ accounts: ACCOUNTS, gh_available: true, fetched_at: "2026-10-18T01:00:00Z" }));
  h.ghRepo.mockImplementation(async () => envelope(REPO, A));
  h.ghContents.mockImplementation(async () => envelope(DIR_ROOT, A));
  h.ghReadme.mockImplementation(async () => envelope(README, A));
  h.ghBranches.mockImplementation(async () => envelope(BRANCHES, A, { page: { page: 1, per_page: 30, has_more: false, total_count: null, limit_hit: false } }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("루트 트리는 폴더를 먼저 보여 주고 긴 파일명을 전부 줄바꿈해 보여 준다", async () => {
  renderAt("/github/alice/demo/code?as=alice");
  const list = await screen.findByRole("list", { name: "파일 목록" });
  const names = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
  expect(names[0]).toMatch(/^docs/);
  expect(names[1]).toMatch(/^src/);
  expect(names[2]).toMatch(/^vendor/);
  expect(screen.getByText(/a-very-long-file-name-that-keeps-going.*generated\.json/)).toBeTruthy();
  expect(h.ghContents).toHaveBeenCalledWith("alice", "alice", "demo", { ref: undefined, path: undefined });
});

it("폴더로 들어가면 path 쿼리가 바뀌고 as·ref 는 유지된다", async () => {
  renderAt("/github/alice/demo/code?as=alice&ref=feat%2Fx");
  fireEvent.click(await screen.findByRole("link", { name: /^src/ }));
  await waitFor(() => expect(where()).toBe("/github/alice/demo/code?as=alice&ref=feat%2Fx&path=src"));
});

it("ref·path 로 직접 들어와도 그대로 조회한다", async () => {
  h.ghContents.mockImplementation(async () => envelope({ kind: "dir", path: "src/lib", ref: "feat/x", entries: [] }, A));
  renderAt("/github/alice/demo/code?as=alice&ref=feat%2Fx&path=src%2Flib");
  await screen.findByText(/비어 있는 폴더/);
  expect(h.ghContents).toHaveBeenCalledWith("alice", "alice", "demo", { ref: "feat/x", path: "src/lib" });
});

it("서브모듈은 열리지 않는 행으로 안내만 한다", async () => {
  renderAt("/github/alice/demo/code?as=alice");
  const row = (await screen.findByText("vendor")).closest("li")!;
  expect(within(row).queryByRole("link")).toBeNull();
  expect(row.textContent).toMatch(/서브모듈/);
});

it("루트에서는 README 를 마크다운으로 보여 주고 raw HTML 은 렌더하지 않는다", async () => {
  const { container } = renderAt("/github/alice/demo/code?as=alice");
  expect(await screen.findByRole("heading", { name: "Demo" })).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("link", { name: "문서" }).getAttribute("href")).toBe("/github/alice/demo/code?as=alice&path=docs%2Fguide.md");
});

it("텍스트 파일은 줄번호와 400줄 단위 더 보기를 준다", async () => {
  h.ghContents.mockImplementation(async () => envelope(FILE_TEXT, A));
  renderAt("/github/alice/demo/code?as=alice&path=src%2Findex.ts");
  const region = await screen.findByRole("region", { name: "코드" });
  expect(within(region).getAllByRole("row")).toHaveLength(400);
  expect(screen.getByText(/1,000줄 중 400줄/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /다음 400줄/ }));
  expect(within(screen.getByRole("region", { name: "코드" })).getAllByRole("row")).toHaveLength(800);
  fireEvent.click(screen.getByRole("button", { name: /다음 200줄/ }));
  expect(within(screen.getByRole("region", { name: "코드" })).getAllByRole("row")).toHaveLength(1000);
  expect(screen.queryByRole("button", { name: /다음/ })).toBeNull();
});

it("긴 줄은 기본이 가로 스크롤이고 줄바꿈 토글로 바꿀 수 있다", async () => {
  h.ghContents.mockImplementation(async () => envelope(FILE_TEXT, A));
  const { container } = renderAt("/github/alice/demo/code?as=alice&path=src%2Findex.ts");
  await screen.findByRole("region", { name: "코드" });
  const box = container.querySelector(".tk-diff") as HTMLElement;
  expect(box.hasAttribute("data-wrap")).toBe(false);
  const toggle = screen.getByRole("button", { name: "줄바꿈" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(toggle);
  expect((container.querySelector(".tk-diff") as HTMLElement).hasAttribute("data-wrap")).toBe(true);
});

it("이진 파일은 본문 대신 안내와 GitHub 링크", async () => {
  h.ghContents.mockImplementation(async () => envelope(FILE_BINARY, A));
  renderAt("/github/alice/demo/code?as=alice&path=logo.png");
  expect(await screen.findByText(/이진 파일은 미리 볼 수 없어요/)).toBeTruthy();
  expect(screen.queryByRole("region", { name: "코드" })).toBeNull();
  expect(screen.getByRole("link", { name: /GitHub 에서 열기/ }).getAttribute("href")).toMatch(/^https:\/\/github\.com\//);
});

it("너무 큰 파일은 크기와 함께 안내한다", async () => {
  h.ghContents.mockImplementation(async () => envelope(FILE_LARGE, A));
  renderAt("/github/alice/demo/code?as=alice&path=data%2Fbig.json");
  expect(await screen.findByText(/너무 커서/)).toBeTruthy();
  expect(screen.getByText(/4\.8 MB라/)).toBeTruthy();
});

it("잘린(truncated) 파일은 일부만 보인다고 알린다", async () => {
  h.ghContents.mockImplementation(async () => envelope(fileContents({ truncated: true, too_large: true, text: codeLines(10) }), A));
  renderAt("/github/alice/demo/code?as=alice&path=src%2Findex.ts");
  expect((await screen.findAllByText(/앞부분만/)).length).toBeGreaterThan(0);
  expect(screen.getByRole("region", { name: "코드" })).toBeTruthy();
});

it("마크다운 파일은 서식 보기와 원문을 바꿔 볼 수 있다", async () => {
  h.ghContents.mockImplementation(async () => envelope(fileContents({ path: "docs/guide.md", name: "guide.md", text: "# 제목\n\n본문" }), A));
  renderAt("/github/alice/demo/code?as=alice&path=docs%2Fguide.md");
  expect(await screen.findByRole("heading", { name: "제목" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "원문" }));
  expect(await screen.findByRole("region", { name: "코드" })).toBeTruthy();
});

it("심링크는 대상을 안내한다", async () => {
  h.ghContents.mockImplementation(async () => envelope({ kind: "symlink", path: "current", ref: "main", entries: null, entries_limit_hit: false, file: null, symlink_target: "releases/v1", submodule: null }, A));
  renderAt("/github/alice/demo/code?as=alice&path=current");
  expect(await screen.findByText(/releases\/v1/)).toBeTruthy();
});

it("브랜치를 고르면 ref 가 바뀌고 path 는 지워진다", async () => {
  renderAt("/github/alice/demo/code?as=alice&path=src");
  fireEvent.click(await screen.findByRole("button", { name: /브랜치·태그 바꾸기/ }));
  fireEvent.click(await screen.findByRole("button", { name: /feature\/very\/long\/branch-name/ }));
  await waitFor(() => expect(where()).toBe("/github/alice/demo/code?as=alice&ref=feature%2Fvery%2Flong%2Fbranch-name-for-mobile-layout-check"));
});

it("브랜치 목록에 없는 태그·커밋도 직접 입력해 열 수 있다", async () => {
  renderAt("/github/alice/demo/code?as=alice");
  fireEvent.click(await screen.findByRole("button", { name: /브랜치·태그 바꾸기/ }));
  const input = await screen.findByLabelText("태그·커밋 직접 입력");
  fireEvent.change(input, { target: { value: "v1.2.0" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(where()).toBe("/github/alice/demo/code?as=alice&ref=v1.2.0"));
});

it("경로가 없거나 권한이 없으면 계정 전환을 권한다", async () => {
  h.ghContents.mockImplementation(async () => { throw new GhApiError({ status: 404, code: "gh_not_found", message: "x" }); });
  renderAt("/github/alice/demo/code?as=alice&path=nope");
  expect(await screen.findByText(/찾을 수 없거나 권한이 없어요/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /bob-work 계정으로 열기/ })).toBeTruthy();
});

it("저장소 자체를 못 열면 하위 화면 호출 없이 오류만 보인다", async () => {
  h.ghRepo.mockImplementation(async () => { throw new GhApiError({ status: 403, code: "gh_forbidden", message: "x", reason: "sso_required" }); });
  renderAt("/github/acme/secret/code?as=alice");
  expect(await screen.findByText(/조직 SSO 승인이 필요해요/)).toBeTruthy();
  expect(h.ghContents).not.toHaveBeenCalled();
});

it("깨진 owner/repo 이름은 서버를 부르지 않는다", async () => {
  renderAt("/github/..%2Fx/demo/code?as=alice");
  expect(await screen.findByText(/찾을 수 없거나 권한이 없어요/)).toBeTruthy();
  expect(h.ghRepo).not.toHaveBeenCalled();
});

it("저장소 개요는 코드·PR·이슈·Actions 이동을 모두 as 와 함께 준다", async () => {
  renderAt("/github/alice/demo?as=alice");
  const nav = await screen.findByRole("navigation", { name: "저장소 메뉴" });
  const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
  expect(hrefs).toEqual([
    "/github/alice/demo/code?as=alice", "/github/alice/demo/pulls?as=alice", "/github/alice/demo/issues?as=alice", "/github/alice/demo/actions?as=alice",
  ]);
});
