import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Game, GameBuild, GameFeedbackSummary, GameSourceDiff, GameVersion } from "../../api/gameTypes";
import { BuildHistory } from "./BuildHistory";
import { resolvePair, togglePair } from "./VersionCompare";
import { EMPTY_FILTER, feedbackParts, filterVersions, originOf, versionsBetween } from "./versionInfo";

const api = vi.hoisted(() => ({
  listGameBuilds: vi.fn(), listGameVersions: vi.fn(), compareGameVersions: vi.fn(), rollbackGame: vi.fn(), getGameBuild: vi.fn(), startGameBuild: vi.fn(), playGame: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock("./captureBuild", () => ({ captureBuild: vi.fn() }));
vi.mock("../../ui/toastStore", () => ({ toast: vi.fn() }));

const NOW = new Date("2026-10-20T12:00:00+09:00").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const build = (seq: number, over: Partial<GameBuild> = {}): GameBuild => ({
  id: `b${seq}`, game_id: "g1", seq, status: "succeeded", source_commit: `c0ffee${seq}aaaa`, source_dirty: false, manifest_sha256: "m", lock_verified: true,
  bundle_sha256: `sha${seq}`, bundle_bytes: 100 * 1024 * seq, bundle_files: 10 + seq, run_id: null, artifact_id: null, restored_from_id: null, error: null,
  created_at: hoursAgo(seq), finished_at: hoursAgo(seq), ...over,
});

const request = (kind: string, instruction: string, feedback: GameFeedbackSummary | null, baseSeq: number | null = null) => ({
  run_id: `r-${instruction}`, session_id: "s1", kind, status: "succeeded", instruction, base_build_id: baseSeq ? `b${baseSeq}` : null, base_build_seq: baseSeq,
  feedback, repair_attempt: 0, lock_after: "verified", created_at: hoursAgo(1),
});

/** 합성 데이터: v4 는 화면 표시·오브젝트 피드백을 반영한 수정, v3 는 피드백 없는 수정, v2 는 수동 빌드, v1 은 첫 개발. 모두 합성이다. */
const toBuild = (v: GameVersion): GameBuild => {
  const copy: Partial<GameVersion> = { ...v };
  delete copy.is_active; delete copy.produced_by; delete copy.requests_on; delete copy.feedback_requests_on;
  return copy as GameBuild;
};

const versions = (): GameVersion[] => [
  { ...build(4, { run_id: "r4", created_at: hoursAgo(1) }), is_active: true, requests_on: 0, feedback_requests_on: 0,
    produced_by: request("modify", "점프가 너무 무거워요. 20% 가볍게", { annotations: 2, picked: 1, clip_frames: 0, has_screenshot: true }, 3) },
  { ...build(3, { run_id: "r3", created_at: hoursAgo(30) }), is_active: false, requests_on: 1, feedback_requests_on: 1,
    produced_by: request("modify", "배경을 밤하늘로", null, 2) },
  { ...build(2, { created_at: hoursAgo(24 * 10) }), is_active: false, requests_on: 0, feedback_requests_on: 0, produced_by: null },
  { ...build(1, { run_id: "r1", status: "failed", error: "빌드 실패: tsc", created_at: hoursAgo(24 * 40) }), is_active: false, requests_on: 1, feedback_requests_on: 0,
    produced_by: request("develop", "별 모으는 게임", null) },
];

const diff = (over: Partial<GameSourceDiff> = {}): GameSourceDiff => ({
  base_build_id: "b3", head_build_id: "b4", available: true, reason: "", same_commit: false, base_dirty: false, head_dirty: false,
  files_total: 2, insertions: 12, deletions: 3, files: [{ path: "src/player.ts", added: 10, deleted: 3 }, { path: "assets/hero.png", added: null, deleted: null }],
  commits: [{ sha: "abc1234", subject: "점프 힘 조정" }], commits_truncated: false, ...over,
});

const game = { id: "g1", slug: "flappy-dot", name: "Flappy Dot", workspace_id: "w1", active_build_id: "b4" } as Game;

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><BuildHistory game={game} shots={{}} onShot={vi.fn()} /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  const vs = versions();
  api.listGameBuilds.mockResolvedValue(vs.map(toBuild));
  api.listGameVersions.mockResolvedValue(vs);
  api.compareGameVersions.mockResolvedValue(diff());
  api.playGame.mockResolvedValue({ url: "https://game.example/play/tok", origin: "https://game.example", expires_at: hoursAgo(-1), build_id: "b3", build_seq: 3, bundle_sha256: "sha3", frame_ancestors: [], sandbox: "allow-scripts" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("버전 정보 순수 함수", () => {
  it("필터: 상태·기간·피드백·검색어를 조합한다", () => {
    const list = versions();
    const f = (over: Partial<typeof EMPTY_FILTER>) => filterVersions(list, { ...EMPTY_FILTER, ...over }, NOW).map((v) => v.seq);
    expect(f({})).toEqual([4, 3, 2, 1]);
    expect(f({ status: "failed" })).toEqual([1]);
    expect(f({ period: "today" })).toEqual([4]); // v3 은 30시간 전
    expect(f({ period: "7d" })).toEqual([4, 3]);
    expect(f({ period: "30d" })).toEqual([4, 3, 2]);
    expect(f({ feedback: "applied" })).toEqual([4]);
    expect(f({ feedback: "received" })).toEqual([3]); // v3 을 보고 피드백 요청이 나갔다
    expect(f({ feedback: "none" })).toEqual([2, 1]);
    expect(f({ text: "밤하늘" })).toEqual([3]);
    expect(f({ text: "V2" })).toEqual([2]); // v번호는 번호만 본다
    expect(f({ text: "c0ffee4" })).toEqual([4]);
    expect(f({ text: "tsc" })).toEqual([1]);
    expect(f({ status: "succeeded", feedback: "applied", period: "today", text: "가볍게" })).toEqual([4]);
    expect(f({ status: "succeeded", text: "별 모으는" })).toEqual([]); // v1 은 실패라 제외
  });

  it("요청 정보가 없으면 피드백 필터는 걸러 내지 못하는 쪽(없음)으로만 동작한다", () => {
    const bare = versions().map(toBuild);
    expect(filterVersions(bare, { ...EMPTY_FILTER, feedback: "applied" }, NOW)).toEqual([]);
    expect(filterVersions(bare, { ...EMPTY_FILTER, feedback: "none" }, NOW)).toHaveLength(4);
  });

  it("피드백 요약·경위 문구", () => {
    expect(feedbackParts({ annotations: 2, picked: 1, clip_frames: 3, has_screenshot: true })).toEqual(["화면 표시 2", "오브젝트 1", "영상 화면 3장"]);
    expect(feedbackParts({ annotations: 0, picked: 0, clip_frames: 0, has_screenshot: true })).toEqual(["스크린샷"]);
    expect(feedbackParts(null)).toEqual([]);
    const [v4, v3, v2] = versions();
    expect(originOf(v4)).toBe("수정 요청 · v3 기준");
    expect(originOf(v3)).toBe("수정 요청 · v2 기준");
    expect(originOf(v2)).toBe("직접 시작한 빌드");
    expect(originOf({ ...v2, restored_from_id: "b1" })).toBe("되돌리기로 만든 복구 빌드");
    expect(originOf({ ...v2, run_id: "r9" })).toBe("AI 요청에서 만든 빌드");
  });

  it("비교 칸: 비어 있으면 최신과 그 이전, 담으면 오른쪽보다 오래된 쪽은 이전 칸, 이미 담긴 것은 뺀다", () => {
    const ok = versions().filter((v) => v.status === "succeeded"); // v4 v3 v2
    expect(resolvePair(ok, { left: null, right: null })).toMatchObject({ left: { seq: 3 }, right: { seq: 4 } });
    const p1 = togglePair(ok, { left: null, right: null }, ok[2]); // v2: 오른쪽(v4)보다 오래됨 → 이전 칸
    expect(resolvePair(ok, p1)).toMatchObject({ left: { seq: 2 }, right: { seq: 4 } });
    const p2 = togglePair(ok, p1, ok[1]); // v3 도 오래됨 → 이전 칸을 v3 로 교체
    expect(resolvePair(ok, p2)).toMatchObject({ left: { seq: 3 }, right: { seq: 4 } });
    const p3 = togglePair(ok, { left: "b2", right: "b3" }, ok[0]); // v4 는 오른쪽(v3)보다 새로움 → 최신 칸
    expect(resolvePair(ok, p3)).toMatchObject({ left: { seq: 2 }, right: { seq: 4 } });
    expect(togglePair(ok, p3, ok[2])).toEqual({ left: null, right: "b4" }); // 이미 담긴 v2 를 빼면 기본값으로 돌아간다
  });

  it("사이의 버전은 작은 쪽 제외·큰 쪽 포함이다", () => {
    const [v4, v3, v2, v1] = versions();
    expect(versionsBetween(versions(), v1, v4).map((v) => v.seq)).toEqual([2, 3, 4]);
    expect(versionsBetween(versions(), v4, v2).map((v) => v.seq)).toEqual([3, 4]);
    expect(versionsBetween(versions(), v3, v3)).toEqual([]);
  });
});

describe("버전 이력 화면", () => {
  it("버전마다 요청문·피드백 종류·기준 버전과 이 버전에 걸린 요청 수를 보인다", async () => {
    wrap();
    const list = await screen.findByRole("list", { name: "빌드 목록" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(await within(rows[0]).findByText("점프가 너무 무거워요. 20% 가볍게")).toBeTruthy();
    expect(within(rows[0]).getByText("화면 표시 2")).toBeTruthy();
    expect(within(rows[0]).getByText("오브젝트 1")).toBeTruthy();
    expect(within(rows[0]).getByText("수정 요청 · v3 기준")).toBeTruthy();
    expect(within(rows[1]).getByText(/이 버전을 보고 수정 요청 1건 \(시각 피드백 1건\)/)).toBeTruthy();
    expect(within(rows[2]).getByText("직접 시작한 빌드")).toBeTruthy();
    expect(within(rows[3]).getByText("빌드 실패: tsc")).toBeTruthy();
  });

  it("검색과 필터로 목록을 줄이고 개수를 알려 주며 지우면 돌아온다", async () => {
    wrap();
    await screen.findByRole("list", { name: "빌드 목록" });
    expect(screen.getByText("버전 4개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /필터/ }));
    const fbGroup = await screen.findByRole("radiogroup", { name: "시각 피드백" });
    fireEvent.click(within(fbGroup).getByLabelText("피드백 반영"));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "빌드 목록" })).getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByText(/버전 4개 중 1개/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "상태" })).getByLabelText("실패"));
    expect(await screen.findByText("조건에 맞는 버전이 없어요")).toBeTruthy(); // 피드백 반영 + 실패 = 없음
    fireEvent.click(screen.getAllByRole("button", { name: "필터 지우기" })[0]);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "빌드 목록" })).getAllByRole("listitem")).toHaveLength(4));
    fireEvent.change(screen.getByRole("searchbox", { name: "버전 검색" }), { target: { value: "밤하늘" } });
    await waitFor(() => expect(within(screen.getByRole("list", { name: "빌드 목록" })).getAllByRole("listitem")).toHaveLength(1));
  });

  it("목록에서 비교에 담으면 비교 칸이 바뀌고 소스 변경·사이의 요청을 보인다", async () => {
    wrap();
    const list = await screen.findByRole("list", { name: "빌드 목록" });
    // 기본: 이전 v3, 최신 v4
    await waitFor(() => expect(api.compareGameVersions).toHaveBeenCalledWith("g1", "b3", "b4"));
    expect(await screen.findByText("바뀐 파일 2개")).toBeTruthy();
    expect(screen.getByText("점프 힘 조정")).toBeTruthy();
    expect(screen.getByText("바이너리")).toBeTruthy();
    // v2 를 담으면 이전 칸이 v2 로 바뀐다
    fireEvent.click(within(within(list).getAllByRole("listitem")[2]).getByRole("button", { name: "v2 비교에 담기" }));
    await waitFor(() => expect(api.compareGameVersions).toHaveBeenCalledWith("g1", "b2", "b4"));
    const between = await screen.findByText("사이의 요청");
    const ol = between.parentElement as HTMLElement;
    expect(within(ol).getByText("배경을 밤하늘로")).toBeTruthy();
    expect(within(ol).getByText("점프가 너무 무거워요. 20% 가볍게")).toBeTruthy();
    expect(within(within(list).getAllByRole("listitem")[2]).getByText("비교 중 · 이전")).toBeTruthy();
    // 다시 누르면 뺀다
    fireEvent.click(within(within(list).getAllByRole("listitem")[2]).getByRole("button", { name: "v2 비교에서 빼기" }));
    await waitFor(() => expect(within(within(list).getAllByRole("listitem")[2]).queryByText("비교 중 · 이전")).toBeNull());
  });

  it("소스 변경을 읽지 못하면 사유를 보이고 빌드 기록 요약은 유지한다", async () => {
    api.compareGameVersions.mockResolvedValue(diff({ available: false, reason: "저장소에서 두 커밋을 읽지 못했어요(저장소가 다시 만들어졌거나 정리됐을 수 있어요).", files: [], commits: [], files_total: 0 }));
    wrap();
    expect(await screen.findByText(/저장소에서 두 커밋을 읽지 못했어요/)).toBeTruthy();
    expect(screen.getByText(/소스 커밋 c0ffee3 → c0ffee4/)).toBeTruthy();
  });

  it("같은 커밋·저장 전 변경 포함 안내", async () => {
    api.compareGameVersions.mockResolvedValue(diff({ same_commit: true }));
    wrap();
    expect(await screen.findByText("두 빌드의 소스 커밋이 같아서 바뀐 소스가 없어요.")).toBeTruthy();
    cleanup();
    api.compareGameVersions.mockResolvedValue(diff({ head_dirty: true }));
    wrap();
    expect(await screen.findByText("저장 전 변경이 들어간 빌드라 실제 소스와 조금 다를 수 있어요.")).toBeTruthy();
  });

  it("이전 서버(versions 없음)에서는 빌드 기록만 보이고 피드백 필터는 숨긴다", async () => {
    api.listGameVersions.mockRejectedValue(new Error("not found"));
    wrap();
    const list = await screen.findByRole("list", { name: "빌드 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(await screen.findByText(/요청·피드백 정보는 아직 읽지 못해/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /필터/ }));
    expect(screen.queryByRole("radiogroup", { name: "시각 피드백" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "상태" })).toBeTruthy();
    expect(screen.queryByText("사이의 요청")).toBeNull();
  });

  it("해 보기는 그 빌드의 서명 주소를 sandbox iframe 으로 열고 닫으면 iframe 을 없앤다", async () => {
    wrap();
    const list = await screen.findByRole("list", { name: "빌드 목록" });
    fireEvent.click(within(within(list).getAllByRole("listitem")[1]).getByRole("button", { name: "v3 해 보기" }));
    const frame = await screen.findByTitle("v3 게임 화면");
    expect(api.playGame).toHaveBeenCalledWith("g1", "b3");
    expect(frame.getAttribute("src")).toBe("https://game.example/play/tok");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);
    await waitFor(() => expect(screen.queryByTitle("v3 게임 화면")).toBeNull());
  });

  it("실패한 빌드에는 비교·해 보기 버튼이 없다", async () => {
    wrap();
    const list = await screen.findByRole("list", { name: "빌드 목록" });
    const failed = within(list).getAllByRole("listitem")[3];
    expect(within(failed).queryByRole("button", { name: /비교에/ })).toBeNull();
    expect(within(failed).queryByRole("button", { name: /해 보기/ })).toBeNull();
  });
});
