import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ArtcraftApp, ArtcraftBug, ArtcraftBugList, ArtcraftJob, ArtcraftOverview } from "../api/artcraftTypes";
import { ApiError } from "../api/client";

const h = vi.hoisted(() => ({
  apps: vi.fn(), remote: vi.fn(), smoke: vi.fn(), control: vi.fn(), job: vi.fn(), bugs: vi.fn(), setBug: vi.fn(), agent: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getArtcraftApps: (...a: unknown[]) => h.apps(...a),
  checkArtcraftRemote: (...a: unknown[]) => h.remote(...a),
  runArtcraftSmoke: (...a: unknown[]) => h.smoke(...a),
  controlArtcraftApp: (...a: unknown[]) => h.control(...a),
  getArtcraftJob: (...a: unknown[]) => h.job(...a),
  listArtcraftBugs: (...a: unknown[]) => h.bugs(...a),
  setArtcraftBug: (...a: unknown[]) => h.setBug(...a),
  getArtcraftAgentConfig: (...a: unknown[]) => h.agent(...a),
}));
import { ArtcraftManagePage } from "./ArtcraftManagePage";
import { FEATURES, moreFeatures } from "../shell/features";

const app = (over: Partial<ArtcraftApp> & { app: string; title: string }): ArtcraftApp => ({
  domain: "image editor", site_status: "Early alpha",
  installed: { release: "0.9.0", cli_ok: true, cli_version: "photocraft-cli 0.9.0", bundle_installed: true, source_build: { commit: "efa1edd", version: "dev" } },
  latest: { tag: null, update_available: null, checked_at: null },
  smoke: { ts: "2026-10-18T01:14:10+0900", source: "artcraft", error: null, passed: 4, total: 4, failed: [], mcp: { ok: true, tools: 25 }, mcp_flow: null, gui: null },
  mcp: { ok: true, tool_count: 25, ms: 40, error: null },
  gui: { running: false, listening: false, port: 7878, transport: "tcp" },
  auth: { mode: "token", label: "토큰 파일", protected: true },
  healthy: true, known_bugs: ["BUG-001"], ...over,
});
const photo = app({ app: "photocraft", title: "PhotoCraft", latest: { tag: "v0.10.0", update_available: true, checked_at: new Date().toISOString() } });
const vector = app({
  app: "vectorcraft", title: "VectorCraft", site_status: "In development", known_bugs: [],
  installed: { release: "0.12.0", cli_ok: true, cli_version: "x", bundle_installed: true, source_build: null },
  latest: { tag: "v0.12.0", update_available: false, checked_at: null },
  smoke: { ts: null, source: "ttakkari", error: null, passed: 2, total: 3, failed: [{ test: "convert svg->pdf", rc: 1, evidence: "x" }], mcp: null, mcp_flow: null, gui: null },
  gui: { running: true, listening: true, port: 7979, transport: "tcp" }, auth: { mode: "none", label: "인증 없음", protected: false },
  mcp: { ok: false, tool_count: null, ms: null, error: "x" },
});
const job = (over: Partial<ArtcraftJob> = {}): ArtcraftJob => ({
  id: "j1", kind: "gui", action: "gui-stop", apps: ["vectorcraft"], mode: null, state: "running", created_at: "2026-10-18T00:00:00+00:00",
  started_at: null, finished_at: null, summary: null, output: "", ...over,
});
const overview = (over: Partial<ArtcraftOverview> = {}): ArtcraftOverview => ({
  generated_at: "2026-10-18T00:00:00+00:00", stale: false, error: null, apps: [photo, vector],
  remote: { checked_at: null, attempted_at: null, error: null, checking: false }, jobs: [], ...over,
});
const bug = (over: Partial<ArtcraftBug> & { id: string; title: string }): ArtcraftBug => ({
  repos: ["storytold/photocraft"], apps: ["photocraft"], severity: "S1", kind: "pr", difficulty: "medium",
  upstream: { state: "related", note: "checked 2026-10-18, similar photocraft#3336" }, found: "2026-10-18", verified: "yes, release 0.9.0",
  sections: { summary: "font scan stalls", repro: "run `photocraft-cli info in.png`", evidence: "```\n1:36.66 total\n```", suggestion: "scan lazily" },
  truncated: [], problems: [], status: "candidate", note: "", url: "", updated_at: null, history: [],
  handoff: "ArtCraft 버그 후보 BUG-001 를 업스트림에 기여하려고 해.\n내가 초안을 확인하고 올리라고 말한 뒤에만 해.", ...over,
});
const sec = bug({
  id: "BUG-002", title: "control channel is open", kind: "security", severity: "S2", difficulty: "hard", apps: ["vectorcraft", "filmcraft", "cadcraft", "gridcraft"],
  repos: ["storytold/vectorcraft"], upstream: { state: "unchecked", note: "" }, status: "selected", sections: { summary: "no auth", repro: "nc", evidence: "ok" },
  handoff: "ArtCraft 버그 후보 BUG-002 (보안)",
});
const sloppy = bug({ id: "BUG-003", title: "help exits 1", severity: "S3", kind: "issue", apps: ["deckcraft"], problems: ["필수 소절 '### Evidence' 가 없거나 비었습니다."], status: "reported", url: "https://github.com/storytold/deckcraft/issues/5" });
const bugs: ArtcraftBugList = {
  source_modified_at: null, apps: ["cadcraft", "deckcraft", "filmcraft", "gridcraft", "photocraft", "vectorcraft"], problems: 1,
  counts: { candidate: 1, selected: 1, in_progress: 0, reported: 1, resolved: 0, deferred: 0, excluded: 0 },
  bugs: [bug({ id: "BUG-001", title: "photocraft font scan" }), sec, sloppy],
};

function mount(path = "/artcraft/manage") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}><ArtcraftManagePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const card = (name: string) => screen.getByRole("listitem", { name });

beforeEach(() => {
  // jsdom 에는 <dialog> 모달 API 가 없다
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  h.apps.mockResolvedValue(overview());
  h.bugs.mockResolvedValue(bugs);
  h.job.mockResolvedValue(job({ state: "succeeded", summary: "종료했습니다." }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("더보기에서 발견된다", () => {
  expect(FEATURES.find((f) => f.root === "artcraft")).toMatchObject({ to: "/artcraft", label: "ArtCraft" });
  expect(moreFeatures().some((f) => f.root === "artcraft")).toBe(true);
});

it("앱 카드에 버전·최신 릴리스·스모크·MCP·포트·인증을 보인다", async () => {
  mount();
  const p = within(await screen.findByRole("listitem", { name: "PhotoCraft" }));
  expect(p.getByText("v0.9.0")).toBeTruthy();
  expect(p.getByText("efa1edd")).toBeTruthy();
  expect(p.getByText("v0.10.0")).toBeTruthy();
  expect(p.getAllByText("업데이트 가능").length).toBeGreaterThan(0);
  expect(p.getByText("4/4 통과")).toBeTruthy();
  expect(p.getByText("25개")).toBeTruthy();
  expect(p.getByText("꺼짐")).toBeTruthy();
  expect(p.getByText("127.0.0.1:7878")).toBeTruthy();
  expect(p.getByText("토큰 파일")).toBeTruthy();
  const v = within(card("VectorCraft"));
  expect(v.getByText("2/3 통과")).toBeTruthy();
  expect(v.getByText("실패: convert svg->pdf")).toBeTruthy();
  expect(v.getByText("실행 중")).toBeTruthy();
  expect(v.getByText("응답 없음")).toBeTruthy();
  expect(v.getByText("인증 없음")).toBeTruthy();
  expect(v.getByText("최신")).toBeTruthy();
  expect(screen.getByText("2개 앱 · 실행 중 1")).toBeTruthy();
  expect(screen.getByText("업데이트 가능 1")).toBeTruthy();
});

it("업데이트는 실행하지 않고 절차만 보여 준다", async () => {
  mount();
  fireEvent.click(await within(await screen.findByRole("listitem", { name: "PhotoCraft" })).findByRole("button", { name: "업데이트 방법" }));
  const dialog = await screen.findByRole("dialog", { name: /업데이트 방법/ });
  expect(within(dialog).getByText(/gh release download -R storytold\/photocraft/)).toBeTruthy();
  expect(within(dialog).getByText(/대신 실행하지 않아요/)).toBeTruthy();
  expect(h.control).not.toHaveBeenCalled();
  expect(h.smoke).not.toHaveBeenCalled();
});

it("앱 종료는 확인 뒤에만 confirm 과 함께 요청한다", async () => {
  h.control.mockResolvedValue(job());
  mount();
  fireEvent.click(await within(await screen.findByRole("listitem", { name: "VectorCraft" })).findByRole("button", { name: "종료" }));
  const dialog = await screen.findByRole("dialog", { name: "VectorCraft 종료" });
  expect(h.control).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(h.control).not.toHaveBeenCalled();
  fireEvent.click(within(card("VectorCraft")).getByRole("button", { name: "종료" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "VectorCraft 종료" })).getByRole("button", { name: "종료" }));
  await waitFor(() => expect(h.control).toHaveBeenCalledWith("vectorcraft", { app: "vectorcraft", action: "stop", confirm: true }));
  expect(await screen.findByRole("status", { name: "진행 중인 작업" })).toBeTruthy();
  expect(await screen.findByText("종료했습니다.")).toBeTruthy();
});

it("앱 실행은 바로 요청한다", async () => {
  h.control.mockResolvedValue(job({ action: "gui-start", apps: ["photocraft"] }));
  mount();
  fireEvent.click(await within(await screen.findByRole("listitem", { name: "PhotoCraft" })).findByRole("button", { name: "실행" }));
  await waitFor(() => expect(h.control).toHaveBeenCalledWith("photocraft", { app: "photocraft", action: "start" }));
});

it("GUI 포함 스모크는 확인을 거치고, CLI 스모크는 바로 돈다", async () => {
  h.smoke.mockResolvedValue(job({ kind: "smoke", action: "smoke-cli", apps: ["photocraft"], state: "succeeded", summary: "CLI 테스트 4/4 통과" }));
  mount();
  await screen.findByRole("listitem", { name: "PhotoCraft" });
  fireEvent.click(screen.getByRole("button", { name: /GUI 포함 스모크/ }));
  const dialog = await screen.findByRole("dialog", { name: "GUI 포함 스모크" });
  expect(h.smoke).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "실행" }));
  await waitFor(() => expect(h.smoke).toHaveBeenCalledWith({ mode: "full", confirm: true }));
  h.smoke.mockClear();
  fireEvent.click(within(card("PhotoCraft")).getByRole("button", { name: "스모크" }));
  await waitFor(() => expect(h.smoke).toHaveBeenCalledWith({ apps: ["photocraft"], mode: "cli" }));
  fireEvent.click(screen.getByRole("button", { name: "CLI 스모크(전체)" }));
  await waitFor(() => expect(h.smoke).toHaveBeenLastCalledWith({ mode: "cli" }));
});

it("진행 중인 작업이 있으면 실행·종료·스모크를 잠그고 서버에서 도는 작업을 이어서 보여 준다", async () => {
  h.apps.mockResolvedValue(overview({ jobs: [job({ kind: "smoke", action: "smoke-full", apps: [], mode: "full" })] }));
  h.job.mockResolvedValue(job({ kind: "smoke", action: "smoke-full", apps: [], mode: "full" }));
  mount();
  expect(await screen.findByRole("status", { name: "진행 중인 작업" })).toBeTruthy();
  expect((within(card("PhotoCraft")).getByRole("button", { name: "실행" }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(card("VectorCraft")).getByRole("button", { name: "종료" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "CLI 스모크(전체)" }) as HTMLButtonElement).disabled).toBe(true);
});

it("최신 버전 확인이 막히면 서버가 알려 준 사유를 토스트로 낸다", async () => {
  h.remote.mockRejectedValue(new ApiError(429, { code: "rate_limited", message: "GitHub 조회 한도를 아끼려고 90초 뒤에 다시 확인할 수 있습니다." }));
  mount();
  await screen.findByRole("listitem", { name: "PhotoCraft" });
  fireEvent.click(screen.getByRole("button", { name: /최신 버전 확인/ }));
  await waitFor(() => expect(h.remote).toHaveBeenCalled());
});

it("새로고침 버튼은 refresh=true 로 다시 읽는다", async () => {
  mount();
  await screen.findByRole("listitem", { name: "PhotoCraft" });
  expect(h.apps).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "상태 새로고침" }));
  await waitFor(() => expect(h.apps).toHaveBeenLastCalledWith(true));
});

it("상태를 못 읽으면 오류와 다시 시도를 보인다", async () => {
  h.apps.mockRejectedValue(new ApiError(502, { code: "status_failed", message: "상태 조회 결과를 해석하지 못했습니다." }));
  mount();
  expect(await screen.findByText("상태 조회 결과를 해석하지 못했습니다.")).toBeTruthy();
  h.apps.mockResolvedValue(overview({ stale: true, error: "시간 초과" }));
  fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
  expect(await screen.findByText(/이전 값을 보여 줘요/)).toBeTruthy();
});

const row = (title: string | RegExp) => screen.getByRole("button", { name: title });
const pickOption = (trigger: HTMLElement, option: string) => { fireEvent.click(trigger); fireEvent.click(screen.getByRole("option", { name: option })); };

it("버그 탭: 앱·심각도·상태로 거르고 카드에 종류·상태를 보인다", async () => {
  mount("/artcraft/manage?tab=bugs");
  expect(await screen.findByText("photocraft font scan")).toBeTruthy();
  expect(screen.getByText("BUGS.md 형식이 어긋난 항목이 1개 있어요. 해당 항목의 안내를 확인하세요.")).toBeTruthy();
  const first = row(/photocraft font scan/);
  expect(first.textContent).toContain("PR 가능");
  expect(row(/control channel is open/).textContent).toContain("보안 비공개 신고 필요");
  expect(row(/control channel is open/).textContent).toContain("vectorcraft, filmcraft, cadcraft 외 1개");
  fireEvent.click(screen.getByRole("button", { name: "기여 선택 1" }));
  expect(screen.queryByText("photocraft font scan")).toBeNull();
  expect(screen.getByText("control channel is open")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "전체 3" }));
  fireEvent.click(screen.getByRole("button", { name: "S1" }));
  expect(screen.getByText("photocraft font scan")).toBeTruthy();
  expect(screen.queryByText("help exits 1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "모든 심각도" }));
  pickOption(screen.getByRole("combobox", { name: /앱/ }), "deckcraft");
  expect(screen.getByText("help exits 1")).toBeTruthy();
  expect(screen.queryByText("photocraft font scan")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "진행 중 0" }));
  expect(screen.getByText("조건에 맞는 항목이 없어요.")).toBeTruthy();
});

it("예전 API 응답(프런트가 먼저 배포된 사이)에서는 깨지지 않고 안내만 보인다", async () => {
  h.bugs.mockResolvedValue({ source_modified_at: null, counts: { unreported: 2 }, bugs: [{ id: "BUG-001", title: "x", apps: "photocraft", body: "old" }] });
  mount("/artcraft/manage?tab=bugs");
  expect(await screen.findByText("백엔드가 새 버전으로 바뀌는 중이에요. 잠시 뒤 다시 열어 주세요.")).toBeTruthy();
});

it("버그 상세: 앱·저장소·심각도·종류·난이도·중복 여부·재현·증거를 보인다", async () => {
  mount("/artcraft/manage?tab=bugs");
  fireEvent.click(await screen.findByRole("button", { name: /photocraft font scan/ }));
  expect(screen.getByText("storytold/photocraft").getAttribute("href")).toBe("https://github.com/storytold/photocraft");
  expect(screen.getByText("비슷한 이슈 있음")).toBeTruthy();
  expect(screen.getByText("checked 2026-10-18, similar photocraft#3336")).toBeTruthy();
  expect(screen.getByText("보통")).toBeTruthy();
  expect(screen.getByText("에이전트 추정")).toBeTruthy();
  expect(screen.getByText("재현 절차")).toBeTruthy();
  expect(screen.getByText("photocraft-cli info in.png")).toBeTruthy();
  expect(screen.getByText(/1:36\.66 total/)).toBeTruthy();
  expect(screen.queryByText("영향")).toBeNull();
  expect(screen.getByText("제안").closest("details")?.hasAttribute("open")).toBe(false);
  expect(screen.getByText("재현 절차").closest("details")?.hasAttribute("open")).toBe(true);
});

it("기여 선택: 후보 → 선택 → 진행 중 → 보고됨 → 해결, GitHub 로는 아무것도 보내지 않는다", async () => {
  h.setBug.mockResolvedValue({});
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  mount("/artcraft/manage?tab=bugs");
  fireEvent.click(await screen.findByRole("button", { name: /photocraft font scan/ }));
  expect(screen.queryByText("에이전트에게 넘길 요청 문구")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "기여로 선택" }));
  await waitFor(() => expect(h.setBug).toHaveBeenCalledWith("BUG-001", { status: "selected", note: "", url: "" }));
  expect(h.setBug).toHaveBeenCalledTimes(1);
  expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("github.com"))).toHaveLength(0);
  fetchSpy.mockRestore();
});

it("선택된 후보에는 요청 문구가 나오고 복사된다. 보안 후보는 공개 신고 금지 안내가 붙는다", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  mount("/artcraft/manage?tab=bugs&focus=BUG-002");
  expect(await screen.findByText("에이전트에게 넘길 요청 문구")).toBeTruthy();
  expect(screen.getByText("보안 후보예요")).toBeTruthy();
  expect(screen.getByText(/공개 이슈나 PR 로 올리지 마세요/)).toBeTruthy();
  expect(screen.getByText(/자동으로 없고/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "요청 문구 복사" }));
  await waitFor(() => expect(write).toHaveBeenCalledWith("ArtCraft 버그 후보 BUG-002 (보안)"));
});

it("진행 단계 표시·다음 단계 버튼·보류·제외·되돌리기·직접 바꾸기", async () => {
  h.setBug.mockResolvedValue({});
  mount("/artcraft/manage?tab=bugs&focus=BUG-002");
  const flow = await screen.findByRole("list", { name: "진행 단계" });
  expect(within(flow).getByText("기여 선택").getAttribute("aria-current")).toBe("step");
  fireEvent.click(screen.getByRole("button", { name: "진행 중으로" }));
  await waitFor(() => expect(h.setBug).toHaveBeenLastCalledWith("BUG-002", { status: "in_progress", note: "", url: "" }));
  fireEvent.click(screen.getByRole("button", { name: "보류" }));
  await waitFor(() => expect(h.setBug).toHaveBeenLastCalledWith("BUG-002", { status: "deferred", note: "", url: "" }));
  fireEvent.click(screen.getByRole("button", { name: "제외" }));
  await waitFor(() => expect(h.setBug).toHaveBeenLastCalledWith("BUG-002", { status: "excluded", note: "", url: "" }));
  pickOption(screen.getByRole("combobox", { name: /상태 직접 바꾸기/ }), "해결");
  await waitFor(() => expect(h.setBug).toHaveBeenLastCalledWith("BUG-002", { status: "resolved", note: "", url: "" }));
});

it("보고됨 후보: 링크·메모를 저장하고 형식 문제를 숨기지 않는다", async () => {
  h.setBug.mockResolvedValue({});
  mount("/artcraft/manage?tab=bugs&focus=BUG-003");
  expect(await screen.findByText("BUGS.md 형식이 어긋났어요")).toBeTruthy();
  expect(screen.getByText(/필수 소절 '### Evidence'/)).toBeTruthy();
  const url = screen.getByLabelText(/올린 이슈·PR 링크/) as HTMLInputElement;
  expect(url.value).toBe("https://github.com/storytold/deckcraft/issues/5");
  fireEvent.change(url, { target: { value: "https://github.com/storytold/deckcraft/pull/6" } });
  fireEvent.change(screen.getByRole("textbox", { name: "메모" }), { target: { value: "PR 올림" } });
  fireEvent.click(screen.getByRole("button", { name: "링크·메모 저장" }));
  await waitFor(() => expect(h.setBug).toHaveBeenCalledWith("BUG-003", { status: "reported", note: "PR 올림", url: "https://github.com/storytold/deckcraft/pull/6" }));
});

it("앱 카드의 BUG 칩은 버그 탭의 해당 항목을 연다", async () => {
  mount();
  fireEvent.click(await within(await screen.findByRole("listitem", { name: "PhotoCraft" })).findByRole("button", { name: "BUG-001" }));
  expect(await screen.findByText("재현 절차")).toBeTruthy();
});

it("에이전트 탭: 형식을 고르고 앱별·전체 설정을 복사한다", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  h.agent.mockResolvedValue({
    note: "stdio 입니다.", all: { json: '{"mcpServers":{}}' },
    apps: [{ app: "photocraft", title: "PhotoCraft", server: "artcraft-photocraft", tool_count: 25, notes: ["PHOTOCRAFT_NO_SYSTEM_FONTS=1 자동 적용"],
      snippets: { json: '{"mcpServers":{"artcraft-photocraft":{}}}', claude: "claude mcp add artcraft-photocraft -- /x mcp photocraft", codex: "[mcp_servers.artcraft-photocraft]" } }],
  });
  mount("/artcraft/manage?tab=agent");
  expect(await screen.findByText("artcraft-photocraft")).toBeTruthy();
  expect(screen.getByText("PHOTOCRAFT_NO_SYSTEM_FONTS=1 자동 적용")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "JSON 복사" }));
  await waitFor(() => expect(write).toHaveBeenCalledWith('{"mcpServers":{"artcraft-photocraft":{}}}'));
  fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
  fireEvent.click(screen.getByRole("button", { name: "Claude Code 복사" }));
  await waitFor(() => expect(write).toHaveBeenLastCalledWith("claude mcp add artcraft-photocraft -- /x mcp photocraft"));
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  expect(screen.getByText("claude mcp add artcraft-photocraft -- /x mcp photocraft")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /전체 JSON 복사/ }));
  await waitFor(() => expect(write).toHaveBeenLastCalledWith('{"mcpServers":{}}'));
});
