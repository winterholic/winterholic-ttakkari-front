import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ApiError } from "../../api/client";
import type { Game, GameRequest } from "../../api/gameTypes";
import type { ArtifactOut } from "../../api/types";
import { FeedbackForm, GameRequests } from "./FeedbackSubmission";
import type { Annotation, Screenshot } from "./feedback";

const api = vi.hoisted(() => ({ uploadFile: vi.fn(), requestGameWork: vi.fn(), listGameRequests: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
const taskCard = vi.hoisted(() => vi.fn());
vi.mock("../tasks/TaskTreeCard", () => ({
  TaskTreeCard: (p: { rootId: string }) => { taskCard(p); return <div data-testid="task-card">{p.rootId}</div>; },
}));
vi.mock("../../ui/toastStore", () => ({ toast: vi.fn() }));

const game = { id: "g1", slug: "flappy-dot", name: "Flappy Dot", workspace_id: "w1" } as Game;
const shot: Screenshot = {
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), url: "blob:x", width: 390, height: 844, source: "bridge-postmessage",
  capturedAt: "2026-10-19T01:02:03.000Z", buildId: "b2", buildSeq: 2, bundleSha256: "0123456789abcdef0123",
};
const art = (id: string, filename: string): ArtifactOut => ({ id, filename, sha256: "ff".repeat(32) } as ArtifactOut);
const annotations: Annotation[] = [{ type: "box", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, { type: "arrow", x1: 0.5, y1: 0.5, x2: 0.8, y2: 0.9 }];

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  api.uploadFile.mockResolvedValue(art("art-1", "flappy-dot-v2.png"));
  api.requestGameWork.mockResolvedValue({ session_id: "s1", run_id: "r1", status: "queued", kind: "modify", build_id: "b2", lock: "verified", created_at: "2026-10-19T01:03:00Z" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("FeedbackForm", () => {
  it("스크린샷을 Artifact 로 올리고 빌드 ID·정규화 좌표를 담은 수정 요청을 worker 로 보낸다", async () => {
    const onSubmitted = vi.fn();
    wrap(<FeedbackForm game={game} build={{ id: "b2", seq: 2 }} screenshot={shot} annotations={annotations} onSubmitted={onSubmitted} />);
    const submit = screen.getByRole("button", { name: "AI 수정 요청" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // 지시 글이 없으면 보낼 수 없다
    fireEvent.change(screen.getByLabelText("이렇게 바꿔 주세요"), { target: { value: "점프가 너무 무거워요" } });
    expect(screen.getByText(/스크린샷 첨부됨 · 표시 2개 · v2/)).toBeTruthy();
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    // 원본 스크린샷은 게임 workspace 의 Artifact 로 저장한다(주석본은 브라우저 canvas 가 있을 때만 추가).
    expect(api.uploadFile).toHaveBeenCalledTimes(1);
    const [file, workspaceId] = api.uploadFile.mock.calls[0];
    expect(workspaceId).toBe("w1");
    expect((file as File).type).toBe("image/png");
    expect((file as File).name).toMatch(/^flappy-dot-v2-\d{14}\.png$/);

    expect(api.requestGameWork).toHaveBeenCalledTimes(1);
    const [gameId, body] = api.requestGameWork.mock.calls[0];
    expect(gameId).toBe("g1");
    expect(body).toMatchObject({ kind: "modify", build_id: "b2" });
    expect(body.instruction).toBe("점프가 너무 무거워요");
    // 스크린샷·영역·캡처 빌드는 문장이 아니라 구조화 필드로 간다. 서버가 이를 worker 가 열 수 있는 파일 경로로 바꾼다.
    expect(body.feedback).toEqual({
      build_id: "b2", artifact_id: "art-1", annotated_artifact_id: null, width: 390, height: 844,
      coordinate_space: "normalized-0-1-top-left", annotations,
    });
  });

  it("캡처 없이 글만으로도 요청할 수 있고 이때는 업로드하지 않는다", async () => {
    const onSubmitted = vi.fn();
    wrap(<FeedbackForm game={game} build={{ id: "b2", seq: 2 }} screenshot={null} annotations={[]} onSubmitted={onSubmitted} />);
    fireEvent.change(screen.getByLabelText("이렇게 바꿔 주세요"), { target: { value: "배경을 밝게" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 수정 요청" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(api.requestGameWork.mock.calls[0][1]).toMatchObject({ instruction: "배경을 밝게", feedback: null });
  });

  it("빌드가 없으면 보낼 수 없다고 알려 주고 단추를 끈다", () => {
    wrap(<FeedbackForm game={game} build={null} screenshot={null} annotations={[]} onSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("이렇게 바꿔 주세요"), { target: { value: "x" } });
    expect(screen.getByText("성공한 빌드가 있어야 요청할 수 있어요.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "AI 수정 요청" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("요청이 거절되면 서버 메시지를 보이고 입력을 지우지 않는다", async () => {
    api.requestGameWork.mockRejectedValue(new ApiError(409, { code: "no_build", message: "성공한 빌드가 없습니다." }));
    const onSubmitted = vi.fn();
    wrap(<FeedbackForm game={game} build={{ id: "b2", seq: 2 }} screenshot={null} annotations={[]} onSubmitted={onSubmitted} />);
    const box = screen.getByLabelText("이렇게 바꿔 주세요") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "다시 해 줘" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 수정 요청" }));
    expect(await screen.findByText("성공한 빌드가 없습니다.")).toBeTruthy();
    expect(box.value).toBe("다시 해 줘");
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

describe("GameRequests", () => {
  const req = (over: Partial<GameRequest>): GameRequest => ({ session_id: "s1", run_id: "r1", status: "running", kind: "modify", build_id: "b2", lock: "verified", created_at: "2026-10-19T01:03:00Z", ...over });

  it("요청마다 기존 작업 트리 카드(Run/세션 카드)로 worker 상태를 보이고 새 상태 체계를 만들지 않는다", async () => {
    api.listGameRequests.mockResolvedValue([req({}), req({ run_id: "r0", session_id: "s0", status: "succeeded" })]);
    wrap(<GameRequests gameId="g1" />);
    const cards = await screen.findAllByTestId("task-card");
    expect(cards.map((c) => c.textContent)).toEqual(["s1", "s0"]);
    expect(screen.getByText("작업 중")).toBeTruthy();
    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "작업 세션 열기" })[0].getAttribute("href")).toBe("/workspace/s1");
  });

  it("요청이 없으면 안내 문구를 보인다", async () => {
    api.listGameRequests.mockResolvedValue([]);
    wrap(<GameRequests gameId="g1" />);
    expect(await screen.findByText(/아직 보낸 수정 요청이 없어요/)).toBeTruthy();
  });

  it("잠금 결정이 바뀐 상태로 접수된 요청에 경고를 붙인다", async () => {
    api.listGameRequests.mockResolvedValue([req({ lock: "tampered" })]);
    wrap(<GameRequests gameId="g1" />);
    expect(await screen.findByText("잠금 결정 변경 감지")).toBeTruthy();
  });
});
