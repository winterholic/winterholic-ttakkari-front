import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GamePlay } from "../../api/gameTypes";
import { GamePlayer } from "./GamePlayer";
import { acceptPickMessage, requestPick } from "./pickBridge";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const frameWindow = {} as Window;
const ctx = { frameWindow, gameOrigin: "https://games.example", expectedId: "abc" };
const hit = (over: Record<string, unknown> = {}) => ({
  scene: "play", name: "player", type: "Rectangle", texture: null, frame: null, text: null, container: null, depth: 5,
  bounds: { x: 0.2, y: 0.4, width: 0.1, height: 0.05 }, ...over,
});
const reply = (over: Record<string, unknown> = {}) => ({
  type: "ttakkari:pick:result", id: "abc", supported: true, point: { x: 0.25, y: 0.5 }, canvas: { width: 390, height: 844 }, scenes: ["play"], hits: [hit()], truncated: false, ...over,
});
const ev = (data: unknown, over: Partial<{ origin: string; source: unknown }> = {}) => ({ origin: "null", source: frameWindow, data, ...over });

describe("pick 응답 검증", () => {
  it("출처 창·origin·요청 id 가 맞는 응답만 받는다", () => {
    expect(acceptPickMessage(ev(reply()), ctx)).toMatchObject({ supported: true, hits: [{ name: "player", type: "Rectangle" }], point: { x: 0.25, y: 0.5 } });
    expect(acceptPickMessage(ev(reply(), { origin: "https://games.example" }), ctx)).not.toBeNull();
    expect(acceptPickMessage(ev(reply(), { origin: "https://evil.example" }), ctx)).toBeNull();
    expect(acceptPickMessage(ev(reply(), { source: {} }), ctx)).toBeNull();
    expect(acceptPickMessage(ev(reply({ id: "other" })), ctx)).toBeNull();
    expect(acceptPickMessage(ev(reply()), { ...ctx, frameWindow: null })).toBeNull();
    for (const bad of [null, "x", [], { type: "ttakkari:capture:result", id: "abc" }, reply({ supported: "yes" })]) expect(acceptPickMessage(ev(bad), ctx)).toBeNull();
  });

  it("미지원 응답은 사유를 그대로(길이 제한) 돌려준다", () => {
    expect(acceptPickMessage(ev({ type: "ttakkari:pick:result", id: "abc", supported: false, reason: "pickAt 이 연결되지 않은 게임입니다." }), ctx)).toEqual({
      supported: false, reason: "pickAt 이 연결되지 않은 게임입니다.",
    });
    const long = acceptPickMessage(ev({ type: "ttakkari:pick:result", id: "abc", supported: false, reason: "x".repeat(900) }), ctx);
    expect(long && !long.supported && long.reason.length).toBe(300);
    const none = acceptPickMessage(ev({ type: "ttakkari:pick:result", id: "abc", supported: false }), ctx);
    expect(none && !none.supported && none.reason).toContain("지원하지 않아요");
  });

  it("규약에 안 맞는 항목은 버리고 개수·글자 길이를 제한한다", () => {
    const hits = [
      hit(), hit({ bounds: { x: 0, y: 0, width: 0, height: 1 } }), hit({ bounds: null }), hit({ type: 3 }), "x", null,
      hit({ name: "n".repeat(500), text: "t".repeat(500) }), ...Array.from({ length: 30 }, () => hit()),
    ];
    const r = acceptPickMessage(ev(reply({ hits })), ctx);
    expect(r?.supported && r.hits.length).toBeLessThanOrEqual(10);
    expect(r?.supported && r.hits.every((h) => h.bounds.width > 0 && h.bounds.height > 0 && typeof h.type === "string")).toBe(true);
    const long = acceptPickMessage(ev(reply({ hits: [hit({ name: "n".repeat(500), text: "t".repeat(500) })] })), ctx);
    expect(long?.supported && long.hits[0].name.length).toBe(80);
    expect(long?.supported && long.hits[0].text?.length).toBe(60);
    expect(acceptPickMessage(ev(reply({ hits: "nope" })), ctx)).toBeNull();
    expect(acceptPickMessage(ev(reply({ point: { x: "a", y: 1 } })), ctx)).toBeNull();
  });
});

function fakeFrame() {
  const post = vi.fn();
  const frame = { contentWindow: { postMessage: post } } as unknown as HTMLIFrameElement;
  return { frame, post, sent: () => post.mock.calls[0][0] as { type: string; id: string; x: number; y: number } };
}

describe("requestPick", () => {
  it("비율 좌표를 0~1 로 맞춰 보내고 같은 id 의 응답으로 풀린다", async () => {
    const f = fakeFrame();
    const p = requestPick(f.frame, "https://games.example", 1.5, -0.2, { timeoutMs: 1000, retryMs: 5000 });
    const sent = f.sent();
    expect(sent).toMatchObject({ type: "ttakkari:pick", x: 1, y: 0 });
    window.dispatchEvent(new MessageEvent("message", { data: reply({ id: sent.id }), origin: "null", source: f.frame.contentWindow as unknown as MessageEventSource }));
    await expect(p).resolves.toMatchObject({ supported: true });
  });

  it("응답이 없으면 이전 템플릿 빌드라는 안내로 거절한다", async () => {
    vi.useFakeTimers();
    const f = fakeFrame();
    const p = requestPick(f.frame, "https://games.example", 0.5, 0.5, { timeoutMs: 1000, retryMs: 400 });
    const settled = expect(p).rejects.toThrow("오브젝트 선택을 지원하지 않아요");
    await vi.advanceTimersByTimeAsync(1100);
    await settled;
    expect(f.post.mock.calls.length).toBeGreaterThan(1); // 부팅 중일 수 있어 다시 보낸다
  });
});

const play: GamePlay = {
  url: "https://games.example/play/x", origin: "https://games.example", expires_at: "2026-10-20T00:00:00Z", build_id: "b2", build_seq: 2,
  bundle_sha256: "abc", frame_ancestors: [], sandbox: "allow-scripts",
};

function renderPlayer() {
  return render(<GamePlayer play={play} loading={false} error={null} onRestart={() => undefined} onCaptured={() => undefined} buildTitle="v2" />);
}

function frameOf(): HTMLIFrameElement {
  return document.querySelector("iframe") as HTMLIFrameElement;
}

describe("GamePlayer 오브젝트 선택 모드", () => {
  it("켜면 선택 레이어가 덮이고, 탭하면 비율 좌표로 묻고, 결과 목록과 경계 박스를 보인다", async () => {
    renderPlayer();
    expect(screen.queryByTestId("game-pick-layer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "오브젝트 선택" }));
    expect(screen.getByText(/바꾸고 싶은 오브젝트를 눌러 보세요/)).toBeTruthy();
    const layer = screen.getByTestId("game-pick-layer");
    layer.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 400, right: 210, bottom: 420, x: 10, y: 20, toJSON: () => ({}) });
    const post = vi.spyOn(frameOf().contentWindow as Window, "postMessage");
    fireEvent.pointerUp(layer, { clientX: 110, clientY: 220 });
    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][0] as { type: string; id: string; x: number; y: number };
    expect(sent).toMatchObject({ type: "ttakkari:pick", x: 0.5, y: 0.5 });
    expect(screen.getByText("오브젝트를 찾는 중")).toBeTruthy();
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: reply({ id: sent.id, hits: [hit({ name: "player" }), hit({ name: "shadow", depth: 0, bounds: { x: 0.1, y: 0.3, width: 0.3, height: 0.1 } })] }),
        origin: "null", source: frameOf().contentWindow as unknown as MessageEventSource,
      }));
    });
    expect(await screen.findByText("이 위치의 오브젝트 2개 · 위에 그려진 것부터")).toBeTruthy();
    expect(screen.getByRole("button", { name: /player/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("game-pick-box").getAttribute("style")).toContain("left: 20%");
    fireEvent.click(screen.getByRole("button", { name: /shadow/ })); // 아래 오브젝트를 고르면 박스가 그쪽으로 옮겨 간다
    expect(screen.getByTestId("game-pick-box").getAttribute("style")).toContain("left: 10%");
    fireEvent.click(screen.getByRole("button", { name: "오브젝트 선택 끝내기" }));
    expect(screen.queryByTestId("game-pick-layer")).toBeNull();
    expect(screen.queryByText("이 위치의 오브젝트 2개 · 위에 그려진 것부터")).toBeNull();
  });

  it("미지원 게임과 빈 위치와 응답 없음을 각각 사유와 함께 알린다", async () => {
    vi.useFakeTimers();
    renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: "오브젝트 선택" }));
    const layer = screen.getByTestId("game-pick-layer");
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const post = vi.spyOn(frameOf().contentWindow as Window, "postMessage");
    const answer = (data: Record<string, unknown>) => act(async () => {
      const sent = post.mock.calls.at(-1)?.[0] as { id: string };
      window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:pick:result", id: sent.id, ...data }, origin: "null", source: frameOf().contentWindow as unknown as MessageEventSource }));
    });
    fireEvent.pointerUp(layer, { clientX: 10, clientY: 10 });
    await answer({ supported: false, reason: "pickAt 이 연결되지 않은 게임입니다." });
    expect(screen.getByText(/이 게임은 오브젝트 선택을 지원하지 않아요. pickAt 이 연결되지 않은 게임입니다./)).toBeTruthy();
    fireEvent.pointerUp(layer, { clientX: 50, clientY: 50 });
    await answer({ supported: true, point: { x: 0.5, y: 0.5 }, hits: [], truncated: false });
    expect(screen.getByText(/고를 수 있는 오브젝트가 없어요/)).toBeTruthy();
    fireEvent.pointerUp(layer, { clientX: 60, clientY: 60 });
    await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
    expect(screen.getByRole("alert").textContent).toContain("이 빌드는 오브젝트 선택을 지원하지 않아요");
  });
});
