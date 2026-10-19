import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import type { Game, GameCreateOut } from "../../api/gameTypes";
import { GameCreate } from "./GameCreate";

const api = vi.hoisted(() => ({ createGame: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../ui/toastStore", () => ({ toast }));

const created = (over: Partial<GameCreateOut> = {}): GameCreateOut => ({
  game: { id: "g9", slug: "cat-jump", name: "점프 고양이", engine_id: "web-phaser" } as Game,
  request: { session_id: "s1", run_id: "r1", status: "queued", kind: "develop", build_id: null, lock: "verified", created_at: "2026-10-19T01:00:00Z" },
  request_error: null,
  ...over,
});

function setup(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><GameCreate onCreated={onCreated} /></QueryClientProvider>);
  return { onCreated, qc };
}
const idea = () => screen.getByLabelText("만들고 싶은 게임을 한 줄로 적어 주세요") as HTMLTextAreaElement;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("GameCreate", () => {
  it("아이디어가 비어 있으면 만들 수 없다", () => {
    setup();
    expect((screen.getByRole("button", { name: "게임 만들기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(idea(), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "게임 만들기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(idea(), { target: { value: "도트 고양이 점프 게임" } });
    expect((screen.getByRole("button", { name: "게임 만들기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("아이디어만 적으면 비운 필드는 null·빈 값으로 보내고 첫 개발까지 맡긴다", async () => {
    api.createGame.mockResolvedValue(created());
    const { onCreated } = setup();
    fireEvent.change(idea(), { target: { value: "  도트 고양이 점프 게임  " } });
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.createGame).toHaveBeenCalledWith({ idea: "도트 고양이 점프 게임", name: null, genre: "", locked_decisions: [], start_development: true });
    expect(onCreated.mock.calls[0][0].game.id).toBe("g9");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
  });

  it("이름·장르·잠글 결정을 담아 보내고, 추가를 누르지 않은 입력도 버리지 않는다", async () => {
    api.createGame.mockResolvedValue(created());
    const { onCreated } = setup();
    fireEvent.change(idea(), { target: { value: "로그라이크" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: " 도트 던전 " } });
    fireEvent.change(screen.getByLabelText("장르"), { target: { value: "로그라이크" } });
    const decision = screen.getByLabelText("꼭 지킬 결정");
    fireEvent.change(decision, { target: { value: "2D 도트 픽셀 그래픽" } });
    fireEvent.keyDown(decision, { key: "Enter" }); // Enter 로 추가하고 폼은 제출되지 않는다
    expect(api.createGame).not.toHaveBeenCalled();
    const list = screen.getByRole("list", { name: "꼭 지킬 결정 목록" });
    expect(within(list).getByText("2D 도트 픽셀 그래픽")).toBeTruthy();
    fireEvent.change(decision, { target: { value: "세로 모바일 터치" } }); // 추가 안 누름
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(api.createGame).toHaveBeenCalledWith({
      idea: "로그라이크", name: "도트 던전", genre: "로그라이크", locked_decisions: ["2D 도트 픽셀 그래픽", "세로 모바일 터치"], start_development: true,
    });
  });

  it("같은 결정은 한 번만 담고, 뺄 수 있다", () => {
    setup();
    const decision = screen.getByLabelText("꼭 지킬 결정");
    for (const v of ["A 규칙", "A 규칙", "B 규칙"]) {
      fireEvent.change(decision, { target: { value: v } });
      fireEvent.click(screen.getByRole("button", { name: "추가" }));
    }
    const list = screen.getByRole("list", { name: "꼭 지킬 결정 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "A 규칙 빼기" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });

  it("게임은 만들었지만 첫 요청 접수가 실패하면 경고하고 그래도 이동한다", async () => {
    api.createGame.mockResolvedValue(created({ request: null, request_error: { code: "request_failed", message: "첫 개발 요청을 접수하지 못했습니다" } }));
    const { onCreated } = setup();
    fireEvent.change(idea(), { target: { value: "게임" } });
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "warning", message: expect.stringContaining("시작하지 못했어요") }));
  });

  it("서버가 거절하면 사유를 보이고 이동하지 않으며 입력을 지우지 않는다", async () => {
    api.createGame.mockRejectedValue(new ApiError(409, { code: "exists", message: "이미 쓰는 slug 입니다." }));
    const { onCreated } = setup();
    fireEvent.change(idea(), { target: { value: "내 아이디어" } });
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("이미 쓰는 slug");
    expect(onCreated).not.toHaveBeenCalled();
    expect(idea().value).toBe("내 아이디어");
  });
});
