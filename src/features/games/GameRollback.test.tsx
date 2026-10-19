import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ApiError } from "../../api/client";
import type { Game, GameBuild } from "../../api/gameTypes";
import { BuildHistory, activeBuildOf, rollbackProblem, summarizeChange } from "./BuildHistory";
import type { Screenshot } from "./feedback";

const api = vi.hoisted(() => ({ listGameBuilds: vi.fn(), rollbackGame: vi.fn(), getGameBuild: vi.fn(), startGameBuild: vi.fn(), playGame: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
const captureBuild = vi.hoisted(() => vi.fn());
vi.mock("./captureBuild", () => ({ captureBuild }));
vi.mock("../../ui/toastStore", () => ({ toast: vi.fn() }));

const build = (seq: number, over: Partial<GameBuild> = {}): GameBuild => ({
  id: `b${seq}`, game_id: "g1", seq, status: "succeeded", source_commit: `c0ffee${seq}aaaa`, source_dirty: false, manifest_sha256: "m", lock_verified: true,
  bundle_sha256: `sha${seq}`, bundle_bytes: 100 * 1024 * seq, bundle_files: 10 + seq, run_id: null, artifact_id: null, restored_from_id: null, error: null,
  created_at: "2026-10-19T01:00:00Z", finished_at: "2026-10-19T01:01:00Z", ...over,
});
const game = { id: "g1", slug: "flappy-dot", name: "Flappy Dot", workspace_id: "w1", active_build_id: "b3" } as Game;

function wrap(shots: Record<string, Screenshot> = {}, onShot = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><BuildHistory game={game} shots={shots} onShot={onShot} /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  api.listGameBuilds.mockResolvedValue([build(3), build(2), build(1, { status: "failed", error: "빌드 실패: tsc" })]);
  api.rollbackGame.mockResolvedValue({ game_id: "g1", active_build_id: "b2", previous_active_build_id: "b3", restore_commit: null, restore_build: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("빌드 목록과 되돌리기", () => {
  it("빌드마다 상태를 보이고 지금 보는 버전에는 되돌리기 버튼이 없다", async () => {
    wrap();
    const list = await screen.findByRole("list", { name: "빌드 목록" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("지금 보는 버전")).toBeTruthy();
    expect(within(rows[0]).queryByRole("button", { name: /되돌리기/ })).toBeNull();
    expect(within(rows[1]).getByRole("button", { name: "v2로 되돌리기" })).toBeTruthy();
    // 실패한 빌드로는 되돌릴 수 없다
    expect(within(rows[2]).queryByRole("button", { name: /되돌리기/ })).toBeNull();
    expect(within(rows[2]).getByText("빌드 실패: tsc")).toBeTruthy();
  });

  it("확인 대화상자에서 취소하면 롤백 API 를 부르지 않는다", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "v2로 되돌리기" }));
    const dialog = await screen.findByRole("dialog", { name: "이 버전으로 되돌리기" });
    expect(within(dialog).getByText(/기존 빌드와 소스 기록은 지우지 않아요/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(api.rollbackGame).not.toHaveBeenCalled();
  });

  it("기본은 활성 포인터만 옮기고 confirm:true 를 명시한다", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "v2로 되돌리기" }));
    const dialog = await screen.findByRole("dialog", { name: "이 버전으로 되돌리기" });
    fireEvent.click(within(dialog).getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(api.rollbackGame).toHaveBeenCalledWith("g1", { build_id: "b2", restore_source: false, confirm: true }));
  });

  it("소스 복구를 고르면 restore_source:true 로 보낸다", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "v2로 되돌리기" }));
    const dialog = await screen.findByRole("dialog", { name: "이 버전으로 되돌리기" });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(api.rollbackGame).toHaveBeenCalledWith("g1", { build_id: "b2", restore_source: true, confirm: true }));
  });

  it("서버가 잠금 위반으로 거절하면 사람 말로 보여 주고 대화상자를 유지한다", async () => {
    api.rollbackGame.mockRejectedValue(new ApiError(409, { code: "lock_violation", message: "lock" }));
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "v2로 되돌리기" }));
    const dialog = await screen.findByRole("dialog", { name: "이 버전으로 되돌리기" });
    fireEvent.click(within(dialog).getByRole("button", { name: "되돌리기" }));
    expect(await within(dialog).findByText(/잠긴 결정이 지금 승인된 결정과 달라/)).toBeTruthy();
  });
});

describe("이전·최신 빌드 비교", () => {
  it("빌드 화면 캡처를 눌러 해당 빌드를 캡처하고 변경 요약을 보인다", async () => {
    const shot = { blob: new Blob(), url: "blob:prev", width: 360, height: 640, source: "bridge-postmessage", capturedAt: "t", buildId: "b2", buildSeq: 2, bundleSha256: "sha2" } as Screenshot;
    captureBuild.mockResolvedValue(shot);
    const onShot = vi.fn();
    wrap({}, onShot);
    const compare = await screen.findByRole("region", { name: "빌드 비교" });
    // 최신(v3)과 이전(v2)이 기본 선택이다
    expect((within(compare).getByRole("combobox", { name: "최신 빌드" }) as HTMLSelectElement).value).toBe("b3");
    expect((within(compare).getByRole("combobox", { name: "이전 빌드" }) as HTMLSelectElement).value).toBe("b2");
    expect(within(compare).getByText(/소스 커밋 c0ffee2 → c0ffee3/)).toBeTruthy();
    fireEvent.click(within(within(compare).getByRole("group", { name: "이전 빌드" })).getByRole("button", { name: /이 빌드 화면 캡처/ }));
    await waitFor(() => expect(captureBuild).toHaveBeenCalledWith("g1", "b2"));
    await waitFor(() => expect(onShot).toHaveBeenCalledWith(shot));
  });

  it("저장된 캡처가 있으면 이미지를 나란히 보인다", async () => {
    const mk = (id: string, seq: number) => ({ blob: new Blob(), url: `blob:${id}`, width: 360, height: 640, source: "bridge-postmessage", capturedAt: "t", buildId: id, buildSeq: seq, bundleSha256: "s" }) as Screenshot;
    wrap({ b2: mk("b2", 2), b3: mk("b3", 3) });
    const compare = await screen.findByRole("region", { name: "빌드 비교" });
    expect(within(compare).getByAltText("이전 빌드 v2 화면").getAttribute("src")).toBe("blob:b2");
    expect(within(compare).getByAltText("최신 빌드 v3 화면").getAttribute("src")).toBe("blob:b3");
  });
});

describe("순수 함수", () => {
  it("활성 빌드는 지정값, 없으면 최근 성공 빌드", () => {
    const list = [build(3, { status: "failed" }), build(2), build(1)];
    expect(activeBuildOf({ active_build_id: "b1" } as Game, list)?.seq).toBe(1);
    expect(activeBuildOf({ active_build_id: null } as Game, list)?.seq).toBe(2);
    expect(activeBuildOf({ active_build_id: null } as Game, [])).toBeNull();
  });
  it("변경 요약은 빌드 기록에서만 만든다", () => {
    expect(summarizeChange(build(1), build(2))).toEqual(["소스 커밋 c0ffee1 → c0ffee2", "번들 +100KB (100KB → 200KB)", "파일 11개 → 12개"]);
    expect(summarizeChange(build(1), build(1))).toContain("번들 내용이 완전히 같아요");
  });
  it("롤백 거절 코드를 사람 말로 바꾼다", () => {
    expect(rollbackProblem(new ApiError(409, { code: "dirty_worktree", message: "x" }))).toMatch(/저장되지 않은 변경/);
    expect(rollbackProblem(new ApiError(500, { code: "weird", message: "서버 오류" }))).toBe("서버 오류");
  });
});
