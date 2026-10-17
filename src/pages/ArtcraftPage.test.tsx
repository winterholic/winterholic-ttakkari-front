import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ArtcraftApp, ArtcraftBugList, ArtcraftJob, ArtcraftOverview } from "../api/artcraftTypes";
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
import { ArtcraftPage } from "./ArtcraftPage";
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
const bugs: ArtcraftBugList = {
  source_modified_at: null, counts: { unreported: 1, reported: 1, resolved: 0 },
  bugs: [
    { id: "BUG-001", apps: "photocraft", severity: "S1", severity_text: "S1", summary: "font scan", verified: "yes", title: "photocraft font scan", body: "repro steps", truncated: false, status: "unreported", note: "", updated_at: null },
    { id: "BUG-003", apps: "deckcraft", severity: "S3", severity_text: "S3", summary: "help exit 1", verified: "yes", title: "help exits 1", body: "", truncated: false, status: "reported", note: "up#1", updated_at: "2026-10-18T00:00:00+00:00" },
  ],
};

function mount(path = "/artcraft") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}><ArtcraftPage /></MemoryRouter>
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
  expect(FEATURES.find((f) => f.root === "artcraft")).toMatchObject({ to: "/artcraft", label: "ArtCraft 관제" });
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

it("버그 탭: 상태 필터·상태 변경·메모 저장", async () => {
  h.setBug.mockResolvedValue({});
  mount("/artcraft?tab=bugs");
  expect(await screen.findByText("photocraft font scan")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "해결 0" }));
  expect(screen.getByText("이 상태의 항목이 없어요.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "전체 2" }));
  const group = screen.getByRole("group", { name: "BUG-001 상태" });
  fireEvent.click(within(group).getByRole("button", { name: "보고됨" }));
  await waitFor(() => expect(h.setBug).toHaveBeenCalledWith("BUG-001", { status: "reported", note: "" }));
  fireEvent.click(screen.getByRole("button", { name: /photocraft font scan/ }));
  expect(screen.getByText("repro steps")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: /메모/ }), { target: { value: "upstream#9" } });
  fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));
  await waitFor(() => expect(h.setBug).toHaveBeenLastCalledWith("BUG-001", { status: "unreported", note: "upstream#9" }));
});

it("앱 카드의 BUG 칩은 버그 탭의 해당 항목을 연다", async () => {
  mount();
  fireEvent.click(await within(await screen.findByRole("listitem", { name: "PhotoCraft" })).findByRole("button", { name: "BUG-001" }));
  expect(await screen.findByText("repro steps")).toBeTruthy();
});

it("에이전트 탭: 형식을 고르고 앱별·전체 설정을 복사한다", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  h.agent.mockResolvedValue({
    note: "stdio 입니다.", all: { json: '{"mcpServers":{}}' },
    apps: [{ app: "photocraft", title: "PhotoCraft", server: "artcraft-photocraft", tool_count: 25, notes: ["PHOTOCRAFT_NO_SYSTEM_FONTS=1 자동 적용"],
      snippets: { json: '{"mcpServers":{"artcraft-photocraft":{}}}', claude: "claude mcp add artcraft-photocraft -- /x mcp photocraft", codex: "[mcp_servers.artcraft-photocraft]" } }],
  });
  mount("/artcraft?tab=agent");
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
