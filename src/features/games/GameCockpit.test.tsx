import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiError } from "../../api/client";
import type { Game, GameBuild, GamePlay } from "../../api/gameTypes";
import { GameCockpit, gameStatus } from "./GameCockpit";

const api = vi.hoisted(() => ({
  getGame: vi.fn(), listGameBuilds: vi.fn(), listGameRequests: vi.fn(), playGame: vi.fn(), startGameBuild: vi.fn(),
  getGameBuild: vi.fn(), rollbackGame: vi.fn(), approveGameLock: vi.fn(), uploadFile: vi.fn(), requestGameWork: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock("../tasks/TaskTreeCard", () => ({ TaskTreeCard: ({ rootId }: { rootId: string }) => <div data-testid="task-card">{rootId}</div> }));

const build = (seq: number, over: Partial<GameBuild> = {}): GameBuild => ({
  id: `b${seq}`, game_id: "g1", seq, status: "succeeded", source_commit: `c0ffee${seq}aaaa`, source_dirty: false, manifest_sha256: "m",
  lock_verified: true, bundle_sha256: `sha${seq}`, bundle_bytes: 100_000 * seq, bundle_files: 10 + seq, run_id: null, artifact_id: null,
  restored_from_id: null, error: null, created_at: "2026-10-19T01:00:00Z", finished_at: "2026-10-19T01:01:00Z", ...over,
});
const game = (over: Partial<Game> = {}): Game => ({
  id: "g1", slug: "flappy-dot", name: "Flappy Dot", engine_id: "web-phaser", workspace_id: "w1", pms_project_id: null, locked_revision: 1,
  active_build_id: "b2", lock_approved: true, lock_matches_repo: true, locked_decisions: ["아트 스타일: 16비트 픽셀"], created_at: "2026-10-19T00:00:00Z",
  last_build: build(2), genre: "아케이드", ...over,
});
const play: GamePlay = {
  url: "http://127.0.0.1:18795/p/tok/index.html#ttk-parent=http%3A%2F%2Flocalhost", origin: "http://127.0.0.1:18795", expires_at: "2026-10-19T02:00:00Z",
  build_id: "b2", build_seq: 2, bundle_sha256: "sha2", frame_ancestors: ["http://localhost"], sandbox: "allow-scripts allow-pointer-lock allow-orientation-lock",
};

function renderCockpit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/games/g1"]}>
        <Routes>
          <Route path="/games/:id" element={<GameCockpit gameId="g1" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getGame.mockResolvedValue(game());
  api.listGameBuilds.mockResolvedValue([build(2), build(1)]);
  api.listGameRequests.mockResolvedValue([]);
  api.playGame.mockResolvedValue(play);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("GameCockpit", () => {
  it("장르·엔진·빌드 칩과 상태 배지, 별도 origin 의 sandbox iframe 을 보인다", async () => {
    renderCockpit();
    const frame = (await screen.findByTitle("게임 화면 v2")) as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe(play.url);
    // 게임은 자기 origin 을 갖지 않는 opaque sandbox 여야 한다. allow-same-origin 이 있으면 PWA 토큰에 닿는다.
    expect(frame.getAttribute("sandbox")).toBe(play.sandbox);
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(screen.getByText("장르 아케이드")).toBeTruthy();
    expect(screen.getByText("엔진 Phaser")).toBeTruthy();
    expect(screen.getByText("빌드 v2")).toBeTruthy();
    expect(screen.getByText("플레이 가능")).toBeTruthy();
    expect(api.playGame).toHaveBeenCalledWith("g1");
  });

  it("재생·일시정지·캡처·전체화면 버튼이 모두 켜져 있다", async () => {
    renderCockpit();
    await screen.findByTitle("게임 화면 v2");
    expect(screen.getByRole("button", { name: "처음부터 다시 재생" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "일시정지" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "현재 화면 캡처" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "전체화면" })).toBeTruthy();
  });

  it("운영 hostname 이 없어 play 가 503 이면 사람 말로 안내하고 iframe 을 만들지 않는다", async () => {
    api.playGame.mockRejectedValue(new ApiError(503, { code: "origin_unconfigured", message: "game origin not configured" }));
    renderCockpit();
    expect(await screen.findByText("게임 미리보기 주소가 아직 설정되지 않았어요")).toBeTruthy();
    expect(screen.queryByTitle(/게임 화면 v/)).toBeNull();
    expect((screen.getByRole("button", { name: "현재 화면 캡처" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("성공한 빌드가 없으면 빌드 시작 버튼을 보인다", async () => {
    api.playGame.mockRejectedValue(new ApiError(409, { code: "not_playable", message: "x" }));
    api.listGameBuilds.mockResolvedValue([]);
    api.getGame.mockResolvedValue(game({ active_build_id: null, last_build: null }));
    api.startGameBuild.mockResolvedValue(build(1, { status: "building" }));
    renderCockpit();
    expect(await screen.findByText("아직 플레이할 수 있는 빌드가 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "빌드 시작" }));
    await waitFor(() => expect(api.startGameBuild).toHaveBeenCalledWith("g1"));
  });

  it("캡처 버튼은 iframe 에 요청을 보내고, 그 iframe 이 보낸 검증된 응답만 스크린샷으로 받는다", async () => {
    URL.createObjectURL = vi.fn(() => "blob:shot");
    renderCockpit();
    const frame = (await screen.findByTitle("게임 화면 v2")) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    fireEvent.click(screen.getByRole("button", { name: "현재 화면 캡처" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][0] as { type: string; id: string };
    expect(sent.type).toBe("ttakkari:capture");
    const png = "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));

    // 다른 창이 id 를 알아 맞혀 보내도 무시한다.
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:capture:result", id: sent.id, width: 390, height: 844, dataUrl: png }, origin: play.origin, source: window })); });
    expect(screen.queryByAltText("캡처한 게임 화면")).toBeNull();

    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:capture:result", id: sent.id, width: 390, height: 844, dataUrl: png }, origin: "null", source: frame.contentWindow })); });
    expect(await screen.findByAltText("캡처한 게임 화면")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "영역 박스" })).toBeTruthy();
  });

  it("일시정지 버튼은 iframe 에 pause 를 보내고, 그 iframe 이 확인해 준 상태로만 계속 버튼으로 바뀐다", async () => {
    renderCockpit();
    const frame = (await screen.findByTitle("게임 화면 v2")) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][0] as { type: string; id: string };
    expect(sent.type).toBe("ttakkari:pause");

    // 다른 창이 보낸 응답과 id 가 다른 응답은 무시한다.
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:paused", id: sent.id, paused: true, supported: true }, origin: play.origin, source: window })); });
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:paused", id: "other", paused: true, supported: true }, origin: "null", source: frame.contentWindow })); });
    expect(screen.queryByRole("button", { name: "계속하기" })).toBeNull();

    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:paused", id: sent.id, paused: true, supported: true }, origin: "null", source: frame.contentWindow })); });
    const resume = await screen.findByRole("button", { name: "계속하기" });
    post.mockClear();
    fireEvent.click(resume);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls[0][0] as { type: string }).type).toBe("ttakkari:resume");
  });

  it("게임이 pause 를 지원하지 않는다고 답하면 안내하고 상태를 바꾸지 않는다", async () => {
    renderCockpit();
    const frame = (await screen.findByTitle("게임 화면 v2")) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][0] as { id: string };
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:paused", id: sent.id, paused: false, supported: false }, origin: "null", source: frame.contentWindow })); });
    expect(await screen.findByText("이 게임은 일시정지를 지원하지 않아요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
  });
});

describe("방금 만든 게임: AI 작업 중 → 자동 빌드", () => {
  const running = { session_id: "s1", run_id: "r1", status: "running", kind: "develop", build_id: null, lock: "verified", created_at: "2026-10-19T01:00:00Z" };
  const noBuildGame = () => game({ active_build_id: null, last_build: null });
  beforeEach(() => {
    api.getGame.mockResolvedValue(noBuildGame());
    api.listGameBuilds.mockResolvedValue([]);
    api.playGame.mockRejectedValue(new ApiError(409, { code: "not_playable", message: "x" }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("빌드가 없고 AI 가 일하는 중이면 빌드 시작 대신 진행 안내를 보이고 AI 작업 탭을 먼저 연다", async () => {
    api.listGameRequests.mockResolvedValue([running]);
    renderCockpit();
    expect(await screen.findByText("AI가 게임을 만드는 중이에요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "빌드 시작" })).toBeNull();
    expect(screen.queryByText("아직 플레이할 수 있는 빌드가 없어요")).toBeNull();
    const empty = screen.getByText("AI가 게임을 만드는 중이에요").closest(".game-stage__empty");
    expect(empty?.getAttribute("role")).toBe("status"); // 오류(alert)가 아니라 진행 안내다
    await waitFor(() => expect(screen.getByRole("tab", { name: /AI 작업/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByText("AI 작업 중")).toBeTruthy();
  });

  it("AI 작업이 끝나면 서버의 자동 빌드가 생길 때까지 빌드 목록을 다시 읽고, 끝나면 게임을 연다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.listGameRequests.mockResolvedValue([running]);
    renderCockpit();
    await screen.findByText("AI가 게임을 만드는 중이에요");
    const callsBefore = api.listGameBuilds.mock.calls.length;
    // 요청이 끝났고 서버가 막 빌드를 시작했다
    api.listGameRequests.mockResolvedValue([{ ...running, status: "succeeded" }]);
    api.listGameBuilds.mockResolvedValue([build(1, { status: "building", finished_at: null, bundle_sha256: null })]);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_100); }); // 요청 목록 폴링(활성일 때 4초)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100); }); // 완료 후 빌드 목록 재조회
    expect(api.listGameBuilds.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(await screen.findByText("빌드 중")).toBeTruthy();
    // 빌드가 끝나면 활성 빌드·플레이 주소를 다시 읽어 게임이 열린다
    api.listGameBuilds.mockResolvedValue([build(1)]);
    api.getGame.mockResolvedValue(game({ active_build_id: "b1", last_build: build(1) }));
    api.playGame.mockResolvedValue({ ...play, build_id: "b1", build_seq: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });
    expect(await screen.findByTitle("게임 화면 v1")).toBeTruthy();
  });
});

describe("gameStatus", () => {
  it("요청 중이면 AI 작업 중, 아니면 최신 빌드 상태를 따른다", () => {
    expect(gameStatus([build(2, { status: "building" })], false, null).text).toBe("빌드 중");
    expect(gameStatus([build(2, { status: "failed" })], false, null).text).toBe("최근 빌드 실패");
    expect(gameStatus([build(2)], true, null).text).toBe("AI 작업 중");
    expect(gameStatus([], false, null).text).toBe("빌드 없음");
  });
});
